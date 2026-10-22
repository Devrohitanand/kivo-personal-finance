import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError, conflict, notFound } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import { parseDateInput } from '../lib/dates.js';
import { outstandingPaise, repaidPaise, summarise } from '../domain/ledger.js';
import type { EntryWithRepayments, PersonWithEntries } from '../lib/serialize.js';

const MAX_SERIALIZATION_RETRIES = 3;

export interface LoadedLedger {
  people: PersonWithEntries[];
  entries: EntryWithRepayments[];
}

const entryInclude = { repayments: { orderBy: { occurredAt: 'asc' } } } satisfies Prisma.EntryInclude;

/**
 * Loads the whole ledger for one user. KIVO is a personal ledger with modest
 * volumes, so deriving every total in memory from a single read keeps one
 * authoritative implementation of the financial rules.
 */
export async function loadLedger(userId: string): Promise<LoadedLedger> {
  const people = await prisma.person.findMany({
    where: { userId },
    include: { entries: { include: entryInclude } },
    orderBy: { name: 'asc' },
  });
  const entries = people.flatMap((person) => person.entries);
  return { people, entries };
}

export async function requirePerson(userId: string, personId: string): Promise<PersonWithEntries> {
  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    include: { entries: { include: entryInclude } },
  });
  if (!person) throw notFound('That person is not in your ledger');
  return person;
}

export async function requireEntry(userId: string, entryId: string): Promise<EntryWithRepayments> {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId },
    include: entryInclude,
  });
  if (!entry) throw notFound('That transaction is not in your ledger');
  return entry;
}

export interface CreateEntryInput {
  userId: string;
  personId?: string;
  personName?: string;
  direction: 'LENT' | 'BORROWED';
  principalPaise: number;
  note?: string;
  occurredAt?: string;
  dueDate?: string | null;
  idempotencyKey?: string;
}

async function findExistingByKey(
  userId: string,
  idempotencyKey: string | undefined,
): Promise<EntryWithRepayments | null> {
  if (!idempotencyKey) return null;
  return prisma.entry.findFirst({ where: { userId, idempotencyKey }, include: entryInclude });
}

/**
 * Records money lent or borrowed. When a name is supplied instead of an id, an
 * existing person with that name is reused so the directory does not accumulate
 * duplicates.
 */
export async function createEntry(input: CreateEntryInput): Promise<EntryWithRepayments> {
  const existing = await findExistingByKey(input.userId, input.idempotencyKey);
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      let personId = input.personId;

      if (!personId) {
        const name = (input.personName ?? '').trim();
        const match = await tx.person.findFirst({
          where: { userId: input.userId, name: { equals: name, mode: 'insensitive' } },
        });
        if (match) {
          personId = match.id;
        } else {
          const created = await tx.person.create({
            data: { userId: input.userId, name },
          });
          personId = created.id;
          await recordAudit(tx, {
            userId: input.userId,
            action: 'create',
            entity: 'person',
            entityId: created.id,
            meta: { name },
          });
        }
      } else {
        const owned = await tx.person.findFirst({
          where: { id: personId, userId: input.userId },
          select: { id: true },
        });
        if (!owned) throw notFound('That person is not in your ledger');
      }

      const entry = await tx.entry.create({
        data: {
          userId: input.userId,
          personId,
          direction: input.direction,
          principalPaise: input.principalPaise,
          note: input.note ?? null,
          occurredAt: input.occurredAt ? parseDateInput(input.occurredAt) : new Date(),
          dueDate: input.dueDate ? parseDateInput(input.dueDate) : null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        include: entryInclude,
      });

      await recordAudit(tx, {
        userId: input.userId,
        action: 'create',
        entity: 'entry',
        entityId: entry.id,
        meta: {
          direction: entry.direction,
          principalPaise: entry.principalPaise,
          personId: entry.personId,
        },
      });

      return entry;
    });
  } catch (error) {
    // A concurrent retry of the same request may lose the race on the unique
    // key; return the winner instead of creating a duplicate record.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await findExistingByKey(input.userId, input.idempotencyKey);
      if (winner) return winner;
    }
    throw error;
  }
}

export interface CreateRepaymentInput {
  userId: string;
  entryId: string;
  amountPaise: number;
  note?: string;
  occurredAt?: string;
  idempotencyKey?: string;
}

/**
 * Applies a repayment to one entry. The outstanding amount is re-read inside a
 * SERIALIZABLE transaction with the entry row locked, so two simultaneous
 * requests can never settle the same paise twice.
 */
export async function createRepayment(input: CreateRepaymentInput) {
  const existing = input.idempotencyKey
    ? await prisma.repayment.findFirst({
        where: { userId: input.userId, idempotencyKey: input.idempotencyKey },
      })
    : null;
  if (existing) {
    const entry = await requireEntry(input.userId, existing.entryId);
    return { repayment: existing, entry };
  }

  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Entry"
            WHERE "id" = ${input.entryId} AND "userId" = ${input.userId}
            FOR UPDATE
          `;
          if (locked.length === 0) throw notFound('That transaction is not in your ledger');

          const entry = await tx.entry.findUniqueOrThrow({
            where: { id: input.entryId },
            include: entryInclude,
          });

          const outstanding = outstandingPaise(entry);
          if (outstanding === 0) {
            throw conflict('This transaction is already settled', { outstandingPaise: 0 });
          }
          if (input.amountPaise > outstanding) {
            throw new HttpError(422, 'over_repayment', 'That is more than what is still outstanding', {
              outstandingPaise: outstanding,
            });
          }

          const repayment = await tx.repayment.create({
            data: {
              userId: input.userId,
              entryId: input.entryId,
              amountPaise: input.amountPaise,
              note: input.note ?? null,
              occurredAt: input.occurredAt ? parseDateInput(input.occurredAt) : new Date(),
              idempotencyKey: input.idempotencyKey ?? null,
            },
          });

          const settled = input.amountPaise === outstanding;
          await recordAudit(tx, {
            userId: input.userId,
            action: settled ? 'settle' : 'create',
            entity: 'repayment',
            entityId: repayment.id,
            meta: {
              entryId: input.entryId,
              amountPaise: input.amountPaise,
              remainingPaise: outstanding - input.amountPaise,
            },
          });

          const refreshed = await tx.entry.findUniqueOrThrow({
            where: { id: input.entryId },
            include: entryInclude,
          });
          return { repayment, entry: refreshed };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        if (error.code === 'P2002' && input.idempotencyKey) {
          const winner = await prisma.repayment.findFirst({
            where: { userId: input.userId, idempotencyKey: input.idempotencyKey },
          });
          if (winner) {
            const entry = await requireEntry(input.userId, winner.entryId);
            return { repayment: winner, entry };
          }
        }
        if (attempt < MAX_SERIALIZATION_RETRIES) continue;
      }
      throw error;
    }
  }

  throw conflict('Could not record the repayment, please try again');
}

export interface RemainingSummary {
  outstandingPaise: number;
  repaidPaise: number;
}

export function entryRemaining(entry: EntryWithRepayments): RemainingSummary {
  return { outstandingPaise: outstandingPaise(entry), repaidPaise: repaidPaise(entry) };
}

export function ledgerTotals(entries: readonly EntryWithRepayments[]) {
  return summarise(entries);
}

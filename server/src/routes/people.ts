import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { pathParam } from '../lib/http.js';
import { asyncHandler, conflict, notFound } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import { validate, readQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/security.js';
import {
  createPersonSchema,
  listPeopleQuerySchema,
  updatePersonSchema,
  type ListPeopleQuery,
} from '../schemas/people.js';
import { loadLedger, requirePerson } from '../services/ledger.js';
import { serializeEntry, serializePerson } from '../lib/serialize.js';
import { personBalance, personStanding } from '../domain/ledger.js';

export const peopleRouter = Router();
peopleRouter.use(requireAuth);

peopleRouter.get(
  '/',
  validate('query', listPeopleQuerySchema),
  asyncHandler(async (req, res) => {
    const query = readQuery<ListPeopleQuery>(req);
    const { people } = await loadLedger(req.session.userId!);

    const withBalances = people
      .filter((person) => query.includeArchived || person.archivedAt === null)
      .map(serializePerson);

    const searched = query.search
      ? withBalances.filter((person) =>
          person.name.toLowerCase().includes(query.search!.toLowerCase()),
        )
      : withBalances;

    const filtered =
      query.status === 'all'
        ? searched
        : searched.filter((person) => person.standing === query.status);

    const counts = {
      all: withBalances.length,
      theyOwe: withBalances.filter((person) => person.standing === 'they-owe').length,
      iOwe: withBalances.filter((person) => person.standing === 'i-owe').length,
      settled: withBalances.filter((person) => person.standing === 'settled').length,
    };

    res.json({ people: filtered, counts });
  }),
);

peopleRouter.post(
  '/',
  validate('body', createPersonSchema),
  asyncHandler(async (req, res) => {
    const { name, phone, note } = req.body as { name: string; phone?: string; note?: string };
    const userId = req.session.userId!;

    const existing = await prisma.person.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' }, archivedAt: null },
    });
    if (existing) throw conflict('Someone with that name is already in your ledger');

    const person = await prisma.person.create({
      data: { userId, name, phone: phone ?? null, note: note ?? null },
    });
    await recordAudit(prisma, { userId, action: 'create', entity: 'person', entityId: person.id });

    const full = await requirePerson(userId, person.id);
    res.status(201).json({ person: serializePerson(full) });
  }),
);

peopleRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const person = await requirePerson(userId, pathParam(req, 'id'));
    const balance = personBalance(person.entries);
    const entries = person.entries
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((entry) => serializeEntry(entry, person.name));

    res.json({
      person: {
        ...serializePerson(person),
        standing: personStanding(balance),
      },
      balance,
      entries,
      repayments: entries
        .flatMap((entry) => entry.repayments)
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    });
  }),
);

peopleRouter.patch(
  '/:id',
  validate('body', updatePersonSchema),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { name, phone, note } = req.body as { name?: string; phone?: string; note?: string };
    await requirePerson(userId, pathParam(req, 'id'));

    if (name) {
      const clash = await prisma.person.findFirst({
        where: {
          userId,
          name: { equals: name, mode: 'insensitive' },
          id: { not: pathParam(req, 'id') },
          archivedAt: null,
        },
      });
      if (clash) throw conflict('Another person already uses that name');
    }

    await prisma.person.update({
      where: { id: pathParam(req, 'id') },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });
    await recordAudit(prisma, {
      userId,
      action: 'update',
      entity: 'person',
      entityId: pathParam(req, 'id'),
    });

    const full = await requirePerson(userId, pathParam(req, 'id'));
    res.json({ person: serializePerson(full) });
  }),
);

peopleRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const person = await requirePerson(userId, pathParam(req, 'id'));
    const balance = personBalance(person.entries);

    if (balance.netPaise !== 0) {
      throw conflict('Settle the balance before archiving this person', balance);
    }

    await prisma.person.update({
      where: { id: person.id },
      data: { archivedAt: person.archivedAt ?? new Date() },
    });
    await recordAudit(prisma, { userId, action: 'archive', entity: 'person', entityId: person.id });
    res.json({ ok: true });
  }),
);

peopleRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    await requirePerson(userId, pathParam(req, 'id'));
    await prisma.person.update({ where: { id: pathParam(req, 'id') }, data: { archivedAt: null } });
    await recordAudit(prisma, { userId, action: 'update', entity: 'person', entityId: pathParam(req, 'id') });
    const full = await requirePerson(userId, pathParam(req, 'id'));
    res.json({ person: serializePerson(full) });
  }),
);

/**
 * Deletes a person together with their history. Entries with repayments are
 * refused so a settled record is never silently destroyed.
 */
peopleRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const person = await requirePerson(userId, pathParam(req, 'id'));

    const repaid = person.entries.some((entry) => entry.repayments.length > 0);
    if (repaid && req.query.force !== 'true') {
      throw conflict(
        'This person has repayment history. Archive them instead, or confirm deletion to remove everything.',
        { requiresConfirmation: true },
      );
    }
    if (!person) throw notFound('That person is not in your ledger');

    await recordAudit(prisma, {
      userId,
      action: 'delete',
      entity: 'person',
      entityId: person.id,
      meta: { entries: person.entries.length },
    });
    await prisma.person.delete({ where: { id: person.id } });
    res.json({ ok: true, deletedEntries: person.entries.length });
  }),
);

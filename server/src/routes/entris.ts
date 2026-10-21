import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { pathParam } from '../lib/http.js';
import { asyncHandler, conflict } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import { parseDateInput } from '../lib/dates.js';
import { validate, readQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/security.js';
import {
  createEntrySchema,
  listEntriesQuerySchema,
  updateEntrySchema,
  type ListEntriesQuery,
} from '../schemas/ledger.js';
import { createEntry, loadLedger, requireEntry } from '../services/ledger.js';
import { serializeEntry } from '../lib/serialize.js';
import { monthWindow } from '../domain/ledger.js';

export const entriesRouter = Router();
entriesRouter.use(requireAuth);

entriesRouter.get(
  '/',
  validate('query', listEntriesQuerySchema),
  asyncHandler(async (req, res) => {
    const query = readQuery<ListEntriesQuery>(req);
    const userId = req.session.userId!;
    const { people, entries } = await loadLedger(userId);
    const names = new Map(people.map((person) => [person.id, person.name]));

    const window = query.month ? monthWindow(query.month) : null;
    const from = query.from ? parseDateInput(query.from) : window?.start ?? null;
    const to = query.to ? parseDateInput(query.to) : window?.end ?? null;

    const dtos = entries
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((entry) => serializeEntry(entry, names.get(entry.personId) ?? 'Unknown'))
      .filter((entry) => {
        if (query.personId && entry.personId !== query.personId) return false;
        if (query.direction && entry.direction !== query.direction) return false;
        if (query.status !== 'all' && entry.status !== query.status) return false;
        if (query.search) {
          const needle = query.search.toLowerCase();
          const haystack = `${entry.personName} ${entry.note ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        const occurred = new Date(entry.occurredAt);
        if (from && occurred.getTime() < from.getTime()) return false;
        if (to && occurred.getTime() >= to.getTime()) return false;
        return true;
      })
      .slice(0, query.limit);

    res.json({ entries: dtos, total: dtos.length });
  }),
);

entriesRouter.post(
  '/',
  validate('body', createEntrySchema),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const body = req.body as {
      personId?: string;
      personName?: string;
      direction: 'LENT' | 'BORROWED';
      principalPaise: number;
      note?: string;
      occurredAt?: string;
      dueDate?: string | null;
      idempotencyKey?: string;
    };

    const entry = await createEntry({ userId, ...body });
    const person = await prisma.person.findUniqueOrThrow({ where: { id: entry.personId } });
    res.status(201).json({ entry: serializeEntry(entry, person.name) });
  }),
);

entriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const entry = await requireEntry(userId, pathParam(req, 'id'));
    const person = await prisma.person.findUniqueOrThrow({ where: { id: entry.personId } });
    res.json({ entry: serializeEntry(entry, person.name) });
  }),
);

entriesRouter.patch(
  '/:id',
  validate('body', updateEntrySchema),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { note, dueDate, occurredAt } = req.body as {
      note?: string;
      dueDate?: string | null;
      occurredAt?: string;
    };
    const entry = await requireEntry(userId, pathParam(req, 'id'));

    await prisma.entry.update({
      where: { id: entry.id },
      data: {
        ...(note !== undefined ? { note } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? parseDateInput(dueDate) : null } : {}),
        ...(occurredAt !== undefined ? { occurredAt: parseDateInput(occurredAt) } : {}),
      },
    });
    await recordAudit(prisma, { userId, action: 'update', entity: 'entry', entityId: entry.id });

    const refreshed = await requireEntry(userId, entry.id);
    const person = await prisma.person.findUniqueOrThrow({ where: { id: refreshed.personId } });
    res.json({ entry: serializeEntry(refreshed, person.name) });
  }),
);

entriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const entry = await requireEntry(userId, pathParam(req, 'id'));

    if (entry.repayments.length > 0 && req.query.force !== 'true') {
      throw conflict('This transaction already has repayments recorded against it', {
        requiresConfirmation: true,
        repaidPaise: entry.repayments.reduce((sum, item) => sum + item.amountPaise, 0),
      });
    }

    await recordAudit(prisma, {
      userId,
      action: 'delete',
      entity: 'entry',
      entityId: entry.id,
      meta: { principalPaise: entry.principalPaise, repayments: entry.repayments.length },
    });
    await prisma.entry.delete({ where: { id: entry.id } });
    res.json({ ok: true });
  }),
);

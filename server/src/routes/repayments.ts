import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { pathParam } from '../lib/http.js';
import { asyncHandler } from '../lib/errors.js';
import { validate, readQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/security.js';
import { amountSchema } from '../schemas/common.js';
import { createRepaymentSchema, listRepaymentsQuerySchema } from '../schemas/ledger.js';
import { createRepayment, requireEntry } from '../services/ledger.js';
import { serializeEntry, serializeRepayment } from '../lib/serialize.js';
import { parseDateInput } from '../lib/dates.js';
import { outstandingPaise } from '../domain/ledger.js';

export const repaymentsRouter = Router();
repaymentsRouter.use(requireAuth);

type ListRepaymentsQuery = z.infer<typeof listRepaymentsQuerySchema>;

repaymentsRouter.get(
  '/',
  validate('query', listRepaymentsQuerySchema),
  asyncHandler(async (req, res) => {
    const query = readQuery<ListRepaymentsQuery>(req);
    const userId = req.session.userId!;
    const from = query.from ? parseDateInput(query.from) : null;
    const to = query.to ? parseDateInput(query.to) : null;

    const rows = await prisma.repayment.findMany({
      where: {
        userId,
        ...(query.entryId ? { entryId: query.entryId } : {}),
        ...(query.personId ? { entry: { personId: query.personId } } : {}),
        ...(from || to
          ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      include: { entry: { select: { personId: true } } },
      orderBy: { occurredAt: 'desc' },
      take: query.limit,
    });

    res.json({ repayments: rows.map((row) => serializeRepayment(row, row.entry.personId)) });
  }),
);

/** Records a partial or full repayment against one entry. */
repaymentsRouter.post(
  '/entries/:entryId',
  validate('body', createRepaymentSchema),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { amount, occurredAt, note, idempotencyKey } = req.body as {
      amount: string | number;
      occurredAt?: string;
      note?: string;
      idempotencyKey?: string;
    };
    const amountPaise = amountSchema.parse(amount);

    const result = await createRepayment({
      userId,
      entryId: pathParam(req, 'entryId'),
      amountPaise,
      ...(occurredAt !== undefined ? { occurredAt } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });

    const person = await prisma.person.findUniqueOrThrow({ where: { id: result.entry.personId } });
    res.status(201).json({
      repayment: serializeRepayment(result.repayment, result.entry.personId),
      entry: serializeEntry(result.entry, person.name),
    });
  }),
);

/** Settles whatever remains on an entry in a single action. */
repaymentsRouter.post(
  '/entries/:entryId/settle',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const entry = await requireEntry(userId, pathParam(req, 'entryId'));
    const remaining = outstandingPaise(entry);

    if (remaining === 0) {
      const person = await prisma.person.findUniqueOrThrow({ where: { id: entry.personId } });
      res.json({ settled: true, entry: serializeEntry(entry, person.name) });
      return;
    }

    const result = await createRepayment({ userId, entryId: entry.id, amountPaise: remaining });
    const person = await prisma.person.findUniqueOrThrow({ where: { id: result.entry.personId } });
    res.status(201).json({
      settled: true,
      repayment: serializeRepayment(result.repayment, result.entry.personId),
      entry: serializeEntry(result.entry, person.name),
    });
  }),
);

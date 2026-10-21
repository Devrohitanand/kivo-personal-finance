import { z } from 'zod';
import { amountSchema, dateInputSchema, idempotencyKeySchema, noteSchema, personNameSchema } from './common.js';

export const createEntrySchema = z
  .object({
    personId: z.string().trim().min(1).optional(),
    personName: personNameSchema.optional(),
    direction: z.enum(['LENT', 'BORROWED']),
    amount: z.union([z.string(), z.number()]),
    occurredAt: dateInputSchema.optional(),
    dueDate: dateInputSchema.nullable().optional(),
    note: noteSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.personId) !== Boolean(value.personName), {
    message: 'Choose an existing person or provide a new name',
    path: ['personId'],
  })
  .transform((value) => ({ ...value, principalPaise: amountSchema.parse(value.amount) }));

export const updateEntrySchema = z.object({
  note: noteSchema,
  dueDate: dateInputSchema.nullable().optional(),
  occurredAt: dateInputSchema.optional(),
});

export const listEntriesQuerySchema = z.object({
  personId: z.string().trim().min(1).optional(),
  direction: z.enum(['LENT', 'BORROWED']).optional(),
  status: z.enum(['all', 'pending', 'overdue', 'settled']).default('all'),
  search: z.string().trim().max(80).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10')
    .optional(),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

export const createRepaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  occurredAt: dateInputSchema.optional(),
  note: noteSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const listRepaymentsQuerySchema = z.object({
  entryId: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

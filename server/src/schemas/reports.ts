import { z } from 'zod';
import { dateInputSchema } from './common.js';

export const reportsQuerySchema = z.object({
  range: z.enum(['this-month', 'last-3-months', 'all-time']).default('this-month'),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const activityQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10')
    .optional(),
  type: z.enum(['all', 'lent', 'borrowed', 'repayments', 'overdue']).default('all'),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

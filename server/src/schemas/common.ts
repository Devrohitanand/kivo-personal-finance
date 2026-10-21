import { z } from 'zod';
import { parseAmountToPaise } from '../lib/money.js';
import { isValidDateInput } from '../lib/dates.js';

export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return parseAmountToPaise(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid amount',
      });
      return z.NEVER;
    }
  });

export const dateInputSchema = z
  .string()
  .refine(isValidDateInput, { message: 'Use a valid date, for example 2026-10-12' });

export const idempotencyKeySchema = z.string().trim().min(8).max(128).optional();

export const personNameSchema = z.string().trim().min(1, 'Name is required').max(80);

export const noteSchema = z.string().trim().max(240).optional();

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+\-\s()]*$/, 'Phone can only contain digits and + - ( )')
  .optional();

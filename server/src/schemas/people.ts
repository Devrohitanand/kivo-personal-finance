import { z } from 'zod';
import { noteSchema, personNameSchema, phoneSchema } from './common.js';

export const createPersonSchema = z.object({
  name: personNameSchema,
  phone: phoneSchema,
  note: noteSchema,
});

export const updatePersonSchema = z
  .object({
    name: personNameSchema.optional(),
    phone: phoneSchema,
    note: noteSchema,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const listPeopleQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'they-owe', 'i-owe', 'settled']).default('all'),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;

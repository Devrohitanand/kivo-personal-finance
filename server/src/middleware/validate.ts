import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HttpError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Parses a request part with a Zod schema and replaces it with the parsed
 * result. Untrusted input is validated before any handler logic runs.
 */
export function validate<S extends ZodTypeAny>(source: Source, schema: S): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    if (source === 'query') {
      // dedicated property so handlers read the validated shape.
      (req as ValidatedRequest).validatedQuery = parsed.data as z.infer<S>;
    } else {
      Object.defineProperty(req, source, { value: parsed.data, writable: true, configurable: true });
    }
    next();
  };
}

export interface ValidatedRequest {
  validatedQuery?: unknown;
}

export function readQuery<T>(req: unknown): T {
  const value = (req as ValidatedRequest).validatedQuery;
  if (value === undefined) {
    throw new HttpError(500, 'internal_error', 'Query was not validated before use');
  }
  return value as T;
}

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AmountError } from '../lib/money.js';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Sign in to continue'): HttpError =>
  new HttpError(401, 'unauthorized', message);

export const forbidden = (message = 'Not allowed'): HttpError =>
  new HttpError(403, 'forbidden', message);

export const notFound = (message = 'Not found'): HttpError =>
  new HttpError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown): HttpError =>
  new HttpError(409, 'conflict', message, details);

export const tooManyRequests = (message: string): HttpError =>
  new HttpError(429, 'rate_limited', message);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: 'validation_error',
        message: 'Some details need fixing',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      },
    };
    res.status(422).json(body);
    return;
  }

  if (error instanceof AmountError) {
    res.status(422).json({ error: { code: 'invalid_amount', message: error.message } });
    return;
  }

  if (error instanceof HttpError) {
    const body: ErrorBody = {
      error: { code: error.code, message: error.message },
    };
    if (error.details !== undefined) body.error.details = error.details;
    res.status(error.status).json(body);
    return;
  }

  // Unexpected failures are logged server side but never echoed to the client.
  console.error('[kivo] unhandled error', error);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}

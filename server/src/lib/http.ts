import { notFound } from './errors.js';
export function pathParam(req: { params: Record<string, string | undefined> }, name: string): string {
  const value = req.params[name];
  if (!value) throw notFound('That record was not found');
  return value;
}

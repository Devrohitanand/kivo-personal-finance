import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: booleanish.default('false'),
  TRUST_PROXY: z.string().default(''),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  CSRF_SECRET: z.string().min(16, 'CSRF_SECRET must be at least 16 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
});

export type AppConfig = z.infer<typeof schema> & {
  isProduction: boolean;
  corsOrigins: string[];
  trustProxy: string | false;
};

let cached: AppConfig | null = null;

/**
 * Reads and validates process.env once. The server refuses to boot with an
 * incomplete environment rather than failing later on a request.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${detail}`);
  }

  const value = parsed.data;
  cached = {
    ...value,
    isProduction: value.NODE_ENV === 'production',
    corsOrigins: value.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: value.TRUST_PROXY.trim() === '' ? false : value.TRUST_PROXY.trim(),
  };
  return cached;
}
export function resetConfigCache(): void {
  cached = null;
}

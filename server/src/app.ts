import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loadConfig } from './config/env.js';
import { errorHandler, notFound } from './lib/errors.js';
import { csrfProtection } from './middleware/security.js';
import { createCsrfToken } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { peopleRouter } from './routes/people.js';
import { entriesRouter } from './routes/entries.js';
import { repaymentsRouter } from './routes/repayments.js';
import { summaryRouter } from './routes/summary.js';
import { reportsRouter, activityRouter } from './routes/reports.js';
import { exportRouter } from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CreateAppOptions {
  /** Disable auth/global rate limits so integration tests can run quickly. */
  disableRateLimits?: boolean;
}


/**
 * Locates the built SPA bundle. Returns null in API-only deployments so the
 * server can run without a frontend build present.
 */
function resolveWebDist(): string | null {
  const candidates = [
    process.env.WEB_DIST_PATH,
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const config = loadConfig();
  const app = express();

  if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: 'kivo.sid',
      store: new PgStore({
        conString: config.DATABASE_URL,
        tableName: 'Session',
        createTableIfMissing: false,
      }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        maxAge: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
      },
    }),
  );

  // Every visitor gets a CSRF token so the SPA can echo it on writes, including
  // the very first login request.
  app.use((req, _res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = createCsrfToken();
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kivo-api', time: new Date().toISOString() });
  });

  if (!options.disableRateLimits) {
    app.use(
      '/api',
      rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }),
    );
  }

  app.use('/api', csrfProtection);
  app.use('/api/auth', authRouter);
  app.use('/api/people', peopleRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/repayments', repaymentsRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/export', exportRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Unknown API route')));

  // Serve the built SPA when it exists so the whole app can run from one origin.
  // The compiled entry point lives in server/dist/src, and a dev run uses tsx,
  // so resolve against several plausible roots instead of assuming one.
  
  const webDist = resolveWebDist();
  if (webDist) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res, next) => {
      res.sendFile(path.join(webDist, 'index.html'), (error) => {
        if (error) next();
      });
    });
  }

  app.use(errorHandler);
  return app;
}

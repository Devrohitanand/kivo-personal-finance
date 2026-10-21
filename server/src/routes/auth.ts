import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/errors.js';
import { createCsrfToken, hashPassword, normaliseEmail, verifyPassword } from '../lib/auth.js';
import { recordAudit } from '../lib/audit.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/security.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../schemas/auth.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts, try again later' } },
});

function startSession(req: { session: { userId?: string; csrfToken?: string } }, userId: string) {
  req.session.userId = userId;
  req.session.csrfToken = createCsrfToken();
}

function userPayload(user: { id: string; name: string; email: string; createdAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Bootstraps a session cookie and the CSRF token the SPA echoes on writes. */
authRouter.get('/csrf', (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = createCsrfToken();
  res.json({ csrfToken: req.session.csrfToken });
});

authRouter.post('/register', authLimiter, validate('body', registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  const normalised = normaliseEmail(email);

  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  if (existing) {
    throw badRequest('That email is already registered');
  }

  const user = await prisma.user.create({
    data: { name, email: normalised, passwordHash: await hashPassword(password) },
  });

  await recordAudit(prisma, { userId: user.id, action: 'register', entity: 'account', entityId: user.id });

  startSession(req, user.id);
  res.status(201).json({ user: userPayload(user), csrfToken: req.session.csrfToken });
}));

authRouter.post('/login', authLimiter, validate('body', loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email: normaliseEmail(email) } });

  // Compare against a dummy hash when the user is unknown so response timing
  // does not reveal which emails exist.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) {
    throw unauthorized('Email or password is incorrect');
  }

  startSession(req, user.id);
  await recordAudit(prisma, { userId: user.id, action: 'login', entity: 'session', entityId: user.id });
  res.json({ user: userPayload(user), csrfToken: req.session.csrfToken });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  res.clearCookie('kivo.sid');
  if (userId) {
    await recordAudit(prisma, { userId, action: 'delete', entity: 'session', entityId: userId });
  }
  res.json({ ok: true });
}));

authRouter.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) {
    res.json({ user: null, csrfToken: req.session.csrfToken ?? null });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    req.session.userId = undefined;
    res.json({ user: null, csrfToken: req.session.csrfToken ?? null });
    return;
  }
  res.json({ user: userPayload(user), csrfToken: req.session.csrfToken ?? null });
}));

authRouter.patch('/me', requireAuth, validate('body', updateProfileSchema), asyncHandler(async (req, res) => {
  const { name } = req.body as { name: string };
  const user = await prisma.user.update({ where: { id: req.session.userId! }, data: { name } });
  res.json({ user: userPayload(user) });
}));

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate('body', changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId! } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is incorrect');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    res.json({ ok: true });
  }),
);

authRouter.delete('/me', requireAuth, validate('body', deleteAccountSchema), asyncHandler(async (req, res) => {
  const { password } = req.body as { password: string };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId! } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw badRequest('Your password is incorrect');
  }
  // Cascades remove people, entries, repayments and audit rows.
  await prisma.user.delete({ where: { id: user.id } });
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('kivo.sid');
  res.json({ ok: true });
}));

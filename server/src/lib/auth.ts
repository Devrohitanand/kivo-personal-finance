   import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/** Passwords are never stored or logged in plaintext. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

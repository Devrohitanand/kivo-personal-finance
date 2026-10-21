import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(200, 'Password is too long')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  password: z.string().min(1, 'Enter your password').max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm account removal' }),
  }),
  password: z.string().min(1, 'Enter your password to confirm'),
});

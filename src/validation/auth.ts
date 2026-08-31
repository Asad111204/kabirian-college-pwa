import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

export const loginSchema = z.object({
  username: z
    .string({ error: 'Enter your username.' })
    .trim()
    .min(1, 'Enter your username.')
    .max(50, 'That username is too long.'),
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(200, 'That password is too long.'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(200, 'That password is too long.'),
    confirmPassword: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password different from your current one.',
    path: ['newPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/**
 * Validation for user account management.
 * The same schemas run in the browser (instant feedback) and on the server
 * (the real check).
 */
import { z } from 'zod'
import { optionalText, requiredText, uuid } from './common'

export const USER_ROLES = ['ADMIN', 'STAFF', 'STUDENT'] as const
export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const

/**
 * Usernames are the login identifier. Letters, numbers and . _ - only, so they
 * can be written on a form, typed on a phone and printed on an ID card without
 * ambiguity. Stored and compared case-insensitively.
 */
export const username = z
  .string({ error: 'Username is required.' })
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(50, 'Use at most 50 characters.')
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'Use letters, numbers, dots, underscores and hyphens only — no spaces.',
  )
  .transform((value) => value.toLowerCase())

export const userCreateSchema = z
  .object({
    fullName: requiredText(120, 'Full name'),
    username,
    email: z
      .union([z.email('Enter a valid email address.'), z.literal('')])
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    role: z.enum(USER_ROLES, { error: 'Choose a role.' }),
    status: z.enum(USER_STATUSES).default('ACTIVE'),
    /** Optionally link this account to an existing staff or student record. */
    staffId: uuid.optional(),
    studentId: uuid.optional(),
  })
  .refine((data) => !(data.staffId && data.studentId), {
    message: 'An account can be linked to a staff record or a student record, not both.',
    path: ['staffId'],
  })
  .refine((data) => !(data.role === 'ADMIN' && (data.staffId || data.studentId)), {
    message: 'Administrator accounts are not linked to a staff or student record.',
    path: ['role'],
  })
  .refine((data) => !(data.role === 'STAFF' && data.studentId), {
    message: 'A staff account cannot be linked to a student record.',
    path: ['studentId'],
  })
  .refine((data) => !(data.role === 'STUDENT' && data.staffId), {
    message: 'A student account cannot be linked to a staff record.',
    path: ['staffId'],
  })

export type UserCreateInput = z.infer<typeof userCreateSchema>

/** Editing the details of an existing account (not the role or the status). */
export const userUpdateSchema = z.object({
  fullName: requiredText(120, 'Full name'),
  email: z
    .union([z.email('Enter a valid email address.'), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  username,
})

export type UserUpdateInput = z.infer<typeof userUpdateSchema>

export const userStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
})

export const userRoleSchema = z.object({
  role: z.enum(USER_ROLES),
  /** Typed confirmation for this deliberately risky action. */
  confirmUsername: optionalText(50),
})

/**
 * Permission overrides for one user, sent as a complete list.
 * Anything not mentioned falls back to the role default.
 */
export const userPermissionsSchema = z.object({
  overrides: z
    .array(
      z.object({
        permissionKey: z.string().min(1).max(64),
        effect: z.enum(['GRANT', 'REVOKE']),
      }),
    )
    .max(200, 'Too many overrides.'),
})

export type UserPermissionsInput = z.infer<typeof userPermissionsSchema>

/** Query for the user list — every filter is applied on the server. */
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.union([z.enum(USER_ROLES), z.literal('ALL')]).default('ALL'),
  status: z.union([z.enum(USER_STATUSES), z.literal('LOCKED'), z.literal('ALL')]).default('ALL'),
  sort: z.enum(['createdAt', 'username', 'lastLoginAt', 'role']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})

export type UserListQuery = z.infer<typeof userListQuerySchema>

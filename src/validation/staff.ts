/**
 * Validation for staff records, teacher assignments and section in-charge.
 *
 * As everywhere else, the academic structure is referenced by id — nothing here
 * knows the name of a class, division, program or subject, so new ones work
 * without touching this file.
 */
import { z } from 'zod'
import { cnic, entityCode, isoDate, optionalText, phone, requiredText, uuid } from './common'

export const EMPLOYMENT_STATUSES = [
  'ACTIVE',
  'ON_LEAVE',
  'INACTIVE',
  'RESIGNED',
  'RETIRED',
  'TERMINATED',
] as const

export const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  INACTIVE: 'Inactive',
  RESIGNED: 'Resigned',
  RETIRED: 'Retired',
  TERMINATED: 'Terminated',
  // Kept only so old rows still display; never offered as a choice.
  LEFT: 'Left',
}

/** Statuses that mean the person is still employed and may hold assignments. */
export const EMPLOYED_STATUSES = ['ACTIVE', 'ON_LEAVE'] as const

export const STAFF_TYPES = ['TEACHING', 'ADMINISTRATIVE', 'SUPPORT'] as const

export const STAFF_TYPE_LABEL: Record<string, string> = {
  TEACHING: 'Teaching',
  ADMINISTRATIVE: 'Administrative',
  SUPPORT: 'Support',
  NON_TEACHING: 'Non-teaching',
}

const optionalCnic = z
  .union([cnic, z.literal('')])
  .optional()
  .transform((v) => (v === '' ? undefined : v))

const optionalPhone = z
  .union([phone, z.literal('')])
  .optional()
  .transform((v) => (v === '' ? undefined : v))

const optionalIsoDate = z
  .union([isoDate, z.literal('')])
  .optional()
  .transform((v) => (v === '' ? undefined : v))

const optionalUuid = z
  .union([uuid, z.literal('')])
  .optional()
  .transform((v) => (v === '' ? undefined : v))

/* -------------------------------------------------------------------------- */
/* The staff member's own details                                             */
/* -------------------------------------------------------------------------- */

const staffDetailsShape = {
  // Personal
  fullName: requiredText(120, 'Full name'),
  fatherOrHusbandName: optionalText(120),
  dateOfBirth: optionalIsoDate,
  gender: z
    .union([z.enum(['MALE', 'FEMALE', 'OTHER']), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  cnicNumber: optionalCnic,

  // Contact
  phone: optionalPhone,
  email: z
    .union([z.email('Enter a valid email address.'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  address: optionalText(500),

  // Employment — designation and department are chosen from reference data.
  designationId: uuid,
  departmentId: optionalUuid,
  staffType: z.enum(STAFF_TYPES, { error: 'Choose a staff type.' }),
  joiningDate: isoDate,

  // Professional
  qualification: optionalText(200),
  notes: optionalText(2000),
}

export const staffCreateSchema = z
  .object({
    ...staffDetailsShape,
    /** Optionally create a staff portal login at the same time. */
    createAccount: z.boolean().default(false),
    username: z
      .string()
      .trim()
      .max(50)
      .transform((v) => (v === '' ? undefined : v.toLowerCase()))
      .optional(),
  })
  .refine((data) => !data.createAccount || (data.username?.length ?? 0) >= 3, {
    message: 'Enter a username of at least 3 characters for the portal account.',
    path: ['username'],
  })
  .refine((data) => !data.username || /^[A-Za-z0-9._-]+$/.test(data.username), {
    message: 'Use letters, numbers, dots, underscores and hyphens only — no spaces.',
    path: ['username'],
  })

export type StaffCreateInput = z.infer<typeof staffCreateSchema>

export const staffUpdateSchema = z.object(staffDetailsShape)
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>

export const staffStatusSchema = z.object({
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  leavingDate: optionalIsoDate,
  reason: optionalText(255),
})

export const staffAccountSchema = z
  .object({
    userId: uuid.optional(),
    username: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(50, 'Use at most 50 characters.')
      .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, underscores and hyphens only.')
      .transform((v) => v.toLowerCase())
      .optional(),
  })
  .refine((data) => Boolean(data.userId) !== Boolean(data.username), {
    message: 'Either choose an existing account or enter a username for a new one.',
    path: ['username'],
  })

export type StaffAccountInput = z.infer<typeof staffAccountSchema>

/* -------------------------------------------------------------------------- */
/* Teacher assignments                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Teacher → Session → Class → Division → Program → Section → Subject.
 *
 * Only the section and subject are stored: the section already knows its
 * session, class, division and program. The other ids are sent so the server
 * can confirm the section really is the one shown in the form.
 */
export const assignmentCreateSchema = z.object({
  academicSessionId: uuid,
  classId: uuid,
  divisionId: uuid,
  programId: uuid,
  sectionId: uuid,
  subjectId: uuid,
  assignedAt: optionalIsoDate,
})

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>

export const assignmentCloseSchema = z.object({
  reason: optionalText(255),
})

/* -------------------------------------------------------------------------- */
/* Section in-charge                                                          */
/* -------------------------------------------------------------------------- */

export const inchargeAssignSchema = z.object({
  academicSessionId: uuid,
  classId: uuid,
  divisionId: uuid,
  programId: uuid,
  sectionId: uuid,
  assignedAt: optionalIsoDate,
})

export type InchargeAssignInput = z.infer<typeof inchargeAssignSchema>

/* -------------------------------------------------------------------------- */
/* List query                                                                 */
/* -------------------------------------------------------------------------- */

export const staffListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  departmentId: z.union([uuid, z.literal('')]).optional().transform((v) => (v === '' ? undefined : v)),
  designationId: z.union([uuid, z.literal('')]).optional().transform((v) => (v === '' ? undefined : v)),
  staffType: z.union([z.enum(STAFF_TYPES), z.literal('ALL')]).default('ALL'),
  status: z.union([z.enum(EMPLOYMENT_STATUSES), z.literal('ALL')]).default('ACTIVE'),
  account: z.enum(['ALL', 'LINKED', 'NONE']).default('ALL'),
  sort: z.enum(['fullName', 'staffCode', 'joiningDate', 'createdAt']).default('fullName'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type StaffListQuery = z.infer<typeof staffListQuerySchema>

/* -------------------------------------------------------------------------- */
/* Reference data: designations and departments                               */
/* -------------------------------------------------------------------------- */

export const designationCreateSchema = z.object({
  name: requiredText(100, 'Designation name'),
  code: z
    .string()
    .trim()
    .max(20, 'Use at most 20 characters.')
    .regex(/^[A-Za-z0-9-]*$/, 'Code may contain letters, numbers and hyphens only.')
    .transform((v) => (v === '' ? undefined : v.toUpperCase()))
    .optional(),
  isTeaching: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const departmentCreateSchema = z.object({
  name: requiredText(100, 'Department name'),
  code: z
    .string()
    .trim()
    .max(20, 'Use at most 20 characters.')
    .regex(/^[A-Za-z0-9-]*$/, 'Code may contain letters, numbers and hyphens only.')
    .transform((v) => (v === '' ? undefined : v.toUpperCase()))
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

// Kept for symmetry with the academics validation module.
export { entityCode }

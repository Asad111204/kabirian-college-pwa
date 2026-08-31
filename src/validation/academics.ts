/**
 * Validation for the academic structure.
 *
 * Every one of these entities is managed by the Admin at runtime — nothing about
 * "Pre-Medical" or "Boys" is written into the application's logic (requirement 4).
 */
import { z } from 'zod'
import { entityCode, isoDate, optionalText, requiredText, sessionName, uuid } from './common'

// --- Academic sessions ------------------------------------------------------

export const academicSessionCreateSchema = z
  .object({
    name: sessionName,
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(['UPCOMING', 'ACTIVE', 'CLOSED']).default('UPCOMING'),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'The end date must be after the start date.',
    path: ['endDate'],
  })

export const academicSessionUpdateSchema = academicSessionCreateSchema

export type AcademicSessionInput = z.infer<typeof academicSessionCreateSchema>

// --- Classes / years --------------------------------------------------------

export const classCreateSchema = z.object({
  name: requiredText(60, 'Class name'),
  displayName: optionalText(100),
  code: entityCode(20, 'Class code'),
  level: z.coerce
    .number({ error: 'Level is required.' })
    .int('Level must be a whole number.')
    .min(1, 'Level starts at 1.')
    .max(50, 'Level looks too large.'),
  isActive: z.boolean().default(true),
})

export const classUpdateSchema = classCreateSchema
export type ClassInput = z.infer<typeof classCreateSchema>

// --- Divisions --------------------------------------------------------------

export const divisionCreateSchema = z.object({
  name: requiredText(60, 'Division name'),
  code: entityCode(10, 'Division code'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const divisionUpdateSchema = divisionCreateSchema
export type DivisionInput = z.infer<typeof divisionCreateSchema>

// --- Programs / groups ------------------------------------------------------

export const programCreateSchema = z.object({
  name: requiredText(80, 'Program name'),
  code: entityCode(20, 'Program code'),
  description: optionalText(255),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const programUpdateSchema = programCreateSchema
export type ProgramInput = z.infer<typeof programCreateSchema>

// --- Subjects ---------------------------------------------------------------

export const subjectCreateSchema = z.object({
  name: requiredText(100, 'Subject name'),
  code: z
    .string()
    .trim()
    .max(20, 'Use at most 20 characters.')
    .regex(/^[A-Za-z0-9-]*$/, 'Code may contain letters, numbers and hyphens only.')
    .transform((v) => (v === '' ? undefined : v.toUpperCase()))
    .optional(),
  description: optionalText(255),
  isActive: z.boolean().default(true),
})

export const subjectUpdateSchema = subjectCreateSchema
export type SubjectInput = z.infer<typeof subjectCreateSchema>

// --- Academic groups (Session x Class x Division x Program) ------------------

export const academicGroupCreateSchema = z.object({
  academicSessionId: uuid,
  classId: uuid,
  divisionId: uuid,
  programId: uuid,
  /** Creates a first section with this name at the same time. */
  initialSectionName: z
    .string()
    .trim()
    .max(20)
    .default('A')
    .transform((v) => (v === '' ? 'A' : v)),
})

export type AcademicGroupInput = z.infer<typeof academicGroupCreateSchema>

/** Creates many groups at once from the Session Structure matrix. */
export const academicGroupBulkSchema = z.object({
  academicSessionId: uuid,
  combinations: z
    .array(z.object({ classId: uuid, divisionId: uuid, programId: uuid }))
    .min(1, 'Select at least one combination.')
    .max(500, 'Too many combinations at once.'),
  initialSectionName: z.string().trim().max(20).default('A'),
})

/** Copies last year's structure into a new session. */
export const copyStructureSchema = z.object({
  fromSessionId: uuid,
  toSessionId: uuid,
  includeCurriculum: z.boolean().default(true),
})

// --- Sections ---------------------------------------------------------------

export const sectionCreateSchema = z.object({
  academicGroupId: uuid,
  name: requiredText(20, 'Section name'),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  isActive: z.boolean().default(true),
})

export const sectionUpdateSchema = z.object({
  name: requiredText(20, 'Section name'),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  isActive: z.boolean().default(true),
  // The section in-charge is no longer edited here. From Phase 5 it is a record
  // with history in `section_incharges`, managed from Staff → Section in-charge.
})

export type SectionInput = z.infer<typeof sectionCreateSchema>

// --- Curriculum (subjects of a class x program in a session) ----------------

export const curriculumSetSchema = z.object({
  academicSessionId: uuid,
  classId: uuid,
  programId: uuid,
  subjects: z
    .array(
      z.object({
        subjectId: uuid,
        isCompulsory: z.boolean().default(true),
      }),
    )
    .max(40, 'That is a lot of subjects — please check the selection.'),
})

export type CurriculumSetInput = z.infer<typeof curriculumSetSchema>

// --- Shared: activate / deactivate ------------------------------------------

export const setActiveSchema = z.object({
  isActive: z.boolean(),
})

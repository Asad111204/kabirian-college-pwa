/**
 * Exam validation, shared by the browser and the server.
 *
 * As everywhere else, the browser copy gives instant feedback and the server
 * copy is the security boundary. Nothing here decides *authorisation* — these
 * schemas only check that a request is well formed. Whether the person may do
 * it, and whether the ids they sent actually belong together, is settled in the
 * service against the database.
 *
 * Marks and percentages travel as **strings**, not numbers. They end up in
 * DECIMAL columns and are compared exactly (ADR-105); parsing them into
 * JavaScript floats on the way in would undo that before the value ever reached
 * the database.
 */
import { z } from 'zod'
import { entityCode, isoDate, optionalText, requiredText, uuid } from './common'
import { tryHundredths } from '@/server/exams/exact'

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

/** Mirrors the `ExamStatus` enum. The UI never writes these words itself. */
export const EXAM_STATUSES = ['DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'COMPLETED', 'CANCELLED'] as const
export type ExamStatusValue = (typeof EXAM_STATUSES)[number]

export const EXAM_STATUS_LABEL: Record<ExamStatusValue, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  MARKS_ENTRY: 'Marks entry',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

/**
 * The date sheet has no column of its own: publishing it is what moves an exam
 * out of DRAFT, and `SCHEDULED` is precisely "the schedule is published".
 *
 * Everything from SCHEDULED onwards counts as published, because marks entry and
 * completion both happen after a schedule has gone out.
 */
export const DATE_SHEET_PUBLISHED_STATUSES: readonly ExamStatusValue[] = [
  'SCHEDULED',
  'MARKS_ENTRY',
  'COMPLETED',
]

export function isDateSheetPublished(status: ExamStatusValue): boolean {
  return DATE_SHEET_PUBLISHED_STATUSES.includes(status)
}

/** Whether the exam may still be configured — papers added, dates changed. */
export function isExamEditable(status: ExamStatusValue): boolean {
  return status === 'DRAFT'
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A mark total such as `100` or `87.50`.
 *
 * Kept as text all the way to the DECIMAL column. Two decimal places is what the
 * column holds, and a third would be silently rounded away, so it is refused.
 */
export const marksValue = z
  .string({ error: 'Maximum marks are required.' })
  .trim()
  .min(1, 'Maximum marks are required.')
  .regex(
    /^\d{1,4}(\.\d{1,2})?$/,
    'Use a number with at most two decimal places, such as 100 or 87.50.',
  )
  // A failed .regex above does not stop this check running, so it must cope
  // with junk rather than throw — a thrown error here would be a 500.
  .refine((value) => (tryHundredths(value) ?? 0) > 0, {
    message: 'Maximum marks must be more than zero.',
  })

/** A pass rule such as `50` or `33.33`. Percentages run from 0 to 100. */
export const percentageValue = z
  .string({ error: 'A passing percentage is required.' })
  .trim()
  .min(1, 'A passing percentage is required.')
  .regex(
    /^\d{1,3}(\.\d{1,2})?$/,
    'Use a percentage with at most two decimal places, such as 50 or 33.33.',
  )
  .refine((value) => (tryHundredths(value) ?? 0) <= 10_000, {
    message: 'A percentage cannot be more than 100.',
  })

/**
 * A time on a clock face, `HH:MM` in 24-hour form.
 *
 * Stored as text rather than as a `time` column: an exam starts at nine in the
 * morning wherever the reader happens to be, and a value that carries a zone
 * would eventually be shifted by one (ADR-082).
 */
export const clockTime = z
  .string()
  .trim()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use a 24-hour time such as 09:00.')

/** An optional field a form submits as "" when left blank. */
const optionalOf = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .transform((value) => (value === '' ? undefined : (value as z.infer<T>)))
    .optional()

/* -------------------------------------------------------------------------- */
/* Exam types                                                                 */
/* -------------------------------------------------------------------------- */

/** `exam_types` has no description column, so the form has no such field. */
export const examTypeCreateSchema = z.object({
  name: requiredText(60, 'Exam type name'),
  code: entityCode(20, 'Exam type code'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const examTypeUpdateSchema = examTypeCreateSchema
export type ExamTypeInput = z.infer<typeof examTypeCreateSchema>

/* -------------------------------------------------------------------------- */
/* Exams                                                                      */
/* -------------------------------------------------------------------------- */

export const examCreateSchema = z
  .object({
    name: requiredText(120, 'Exam name'),
    examTypeId: uuid,
    academicSessionId: uuid,
    startDate: optionalOf(isoDate),
    endDate: optionalOf(isoDate),
    description: optionalText(500),
  })
  .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
    message: 'The exam cannot end before it starts.',
    path: ['endDate'],
  })

/**
 * Editing does not accept a status. Moving an exam between states is its own
 * action with its own audit entry, so a stray field on a form can never cancel
 * an exam or publish a schedule by accident.
 */
export const examUpdateSchema = examCreateSchema

export type ExamInput = z.infer<typeof examCreateSchema>

export const examListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  academicSessionId: optionalOf(uuid),
  examTypeId: optionalOf(uuid),
  status: optionalOf(z.enum(EXAM_STATUSES)),
})

export type ExamListQuery = z.infer<typeof examListQuerySchema>

/** Cancelling an exam, or reopening a cancelled one. */
export const examStatusSchema = z.object({
  status: z.enum(['DRAFT', 'CANCELLED'], {
    error: 'An exam can only be cancelled or returned to draft here.',
  }),
})

/** Publishing or withdrawing the date sheet. */
export const dateSheetPublishSchema = z.object({
  publish: z.boolean({ error: 'Say whether the date sheet is being published or withdrawn.' }),
})

/* -------------------------------------------------------------------------- */
/* Exam papers                                                                */
/* -------------------------------------------------------------------------- */

export const examPaperCreateSchema = z
  .object({
    classId: uuid,
    subjectId: uuid,
    /** Blank means every programme in the class sits this paper (ADR-109). */
    programId: optionalOf(uuid),
    examDate: optionalOf(isoDate),
    startTime: optionalOf(clockTime),
    endTime: optionalOf(clockTime),
    room: optionalText(50),
    maxMarks: marksValue,
    passingPercentage: percentageValue.default('50.00'),
  })
  .refine((d) => !d.endTime || d.startTime, {
    message: 'Give a start time as well as an end time.',
    path: ['startTime'],
  })
  .refine((d) => !d.startTime || !d.endTime || d.endTime > d.startTime, {
    message: 'The paper cannot end before it starts.',
    path: ['endTime'],
  })

export const examPaperUpdateSchema = examPaperCreateSchema
export type ExamPaperInput = z.infer<typeof examPaperCreateSchema>

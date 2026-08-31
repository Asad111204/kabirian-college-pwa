/**
 * Result validation, shared by the browser and the server.
 *
 * These settle the shape of a request. Who may make it is decided in
 * results.service.ts, and what the numbers come to is decided by the pure
 * calculation in `exams/grading.ts`.
 */
import { z } from 'zod'
import { optionalText, uuid } from './common'

/** Mirrors the `ResultOutcome` enum. */
export const RESULT_OUTCOMES = ['PASS', 'FAIL', 'INCOMPLETE'] as const
export type ResultOutcomeValue = (typeof RESULT_OUTCOMES)[number]

export const RESULT_OUTCOME_LABEL: Record<ResultOutcomeValue, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  INCOMPLETE: 'Incomplete',
}

/** Mirrors the `ResultStatus` enum. DRAFT is "generated but not visible". */
export const RESULT_STATUSES = ['DRAFT', 'PUBLISHED'] as const
export type ResultStatusValue = (typeof RESULT_STATUSES)[number]

export const RESULT_STATUS_LABEL: Record<ResultStatusValue, string> = {
  DRAFT: 'Generated',
  PUBLISHED: 'Published',
}

/** A form sends "" for a filter it is not applying. */
const optionalOf = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .transform((value) => (value === '' ? undefined : (value as z.infer<T>)))
    .optional()

export const resultListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  classId: optionalOf(uuid),
  programId: optionalOf(uuid),
  sectionId: optionalOf(uuid),
  outcome: optionalOf(z.enum(RESULT_OUTCOMES)),
  status: optionalOf(z.enum(RESULT_STATUSES)),
})

export type ResultListQuery = z.infer<typeof resultListQuerySchema>

/**
 * Generating results.
 *
 * `regenerate` is deliberately explicit. Without it, a second generation is
 * refused rather than quietly superseding results somebody may already have
 * seen; with it, the existing versions are kept and a new version is written.
 */
export const generateResultsSchema = z.object({
  regenerate: z.boolean().default(false),
  reason: optionalText(255),
})

export type GenerateResultsInput = z.infer<typeof generateResultsSchema>

export const publishResultsSchema = z.object({
  publish: z.boolean({ error: 'Say whether the results are being published or withdrawn.' }),
})

/**
 * A teacher's filters.
 *
 * Every one of these NARROWS what they may already see. None of them can widen
 * it: the scope comes from their own ACTIVE assignments, resolved on the server
 * from the session, and these are ANDed inside it.
 */
export const teacherResultQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  examId: optionalOf(uuid),
  classId: optionalOf(uuid),
  programId: optionalOf(uuid),
  sectionId: optionalOf(uuid),
  subjectId: optionalOf(uuid),
})

export type TeacherResultQuery = z.infer<typeof teacherResultQuerySchema>

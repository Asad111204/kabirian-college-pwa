import { z } from 'zod'
import { isoDate, optionalText, requiredText, uuid } from './common'

/**
 * Homework: a piece of work a teacher sets for one section in one subject,
 * with a title, instructions, an optional due date and any number of
 * attached files (Phase 20).
 */
const optionalDate = z.preprocess((v) => (v === '' || v === null ? undefined : v), isoDate.optional())

export const homeworkCreateSchema = z.object({
  sectionId: uuid,
  subjectId: uuid,
  title: requiredText(200, 'Title'),
  instructions: optionalText(4000).transform((v) => v ?? ''),
  /** On the college calendar; no due date means "whenever the teacher says". */
  dueDate: optionalDate,
})

export const homeworkUpdateSchema = z.object({
  title: requiredText(200, 'Title'),
  instructions: optionalText(4000).transform((v) => v ?? ''),
  dueDate: optionalDate,
})

const flag = (fallback: boolean) => z.preprocess((v) => (v === undefined ? fallback : v === true || v === 'true' || v === '1'), z.boolean())

/** The office's and a teacher's list. */
export const homeworkListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  sectionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  subjectId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  search: z.string().trim().max(100).optional(),
  /** Past-due homework is kept but hidden by default. */
  includePast: flag(false),
})

/** A student's feed. */
export const homeworkFeedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(20),
  includePast: flag(false),
})

export type HomeworkCreateInput = z.infer<typeof homeworkCreateSchema>
export type HomeworkUpdateInput = z.infer<typeof homeworkUpdateSchema>
export type HomeworkListQuery = z.infer<typeof homeworkListQuerySchema>
export type HomeworkFeedQuery = z.infer<typeof homeworkFeedQuerySchema>

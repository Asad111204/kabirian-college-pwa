import { z } from 'zod'
import { requiredText, uuid } from './common'
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from '@/server/complaints/complaints-policy'

/**
 * Complaints: a student's written application to the office, and the exchange
 * that follows it (Phase 23).
 */
export const complaintCategorySchema = z.enum(COMPLAINT_CATEGORIES, { error: 'Choose what the application is about.' })
export const complaintStatusSchema = z.enum(COMPLAINT_STATUSES, { error: 'That is not a state an application can be in.' })

/** Long enough to explain something properly, short enough to stay readable. */
const bodyText = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(20, 'Please write at least a couple of sentences so the office can act on it.')
    .max(4000, 'Use at most 4000 characters.')

export const complaintCreateSchema = z.object({
  category: complaintCategorySchema,
  subject: requiredText(150, 'Subject'),
  body: bodyText('The application'),
})

/** One message added to an open application, by the student or the office. */
export const complaintReplySchema = z.object({
  body: z
    .string({ error: 'A reply is required.' })
    .trim()
    .min(2, 'Write a reply before sending it.')
    .max(4000, 'Use at most 4000 characters.'),
})

/** The office moving an application to another state, with a reason it must give when closing. */
export const complaintStatusChangeSchema = z.object({
  status: complaintStatusSchema,
  /** Sent as the office's closing message when resolving; optional otherwise. */
  note: z
    .string()
    .trim()
    .max(4000, 'Use at most 4000 characters.')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

const optionalEnum = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === 'ALL' ? undefined : v), schema.optional())

/** The office's list. */
export const complaintListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  status: optionalEnum(complaintStatusSchema),
  category: optionalEnum(complaintCategorySchema),
  studentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  /** Matches the subject or the student's name; never the body, which is not a search index. */
  search: z.string().trim().max(100).optional(),
  /** Only the ones waiting on the office, which is what a morning starts with. */
  awaitingOffice: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
})

/** A student's own list. */
export const myComplaintsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(20),
  /** Resolved and withdrawn ones are kept but folded away by default. */
  includeClosed: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
})

export type ComplaintCreateInput = z.infer<typeof complaintCreateSchema>
export type ComplaintReplyInput = z.infer<typeof complaintReplySchema>
export type ComplaintStatusChangeInput = z.infer<typeof complaintStatusChangeSchema>
export type ComplaintListQuery = z.infer<typeof complaintListQuerySchema>
export type MyComplaintsQuery = z.infer<typeof myComplaintsQuerySchema>

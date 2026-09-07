/**
 * Notice and event validation, shared by the browser and the server.
 *
 * As everywhere else, the browser copy gives instant feedback and the server
 * copy is the security boundary. Nothing here decides *authorisation*, and
 * nothing here decides *who sees what* -- that is `notice-policy.ts`, run by
 * the service against the database. These schemas only check that a request
 * is well formed: a title of a sensible length, a real audience with the right
 * id on it, dates in the right order.
 *
 * Times arrive as the college's own wall-clock time -- `2026-09-08T08:00` --
 * with no zone on them. A form in Karachi and a form on a laptop abroad send
 * the same string for the same bell, and the server turns it into an instant
 * using APP_TIMEZONE. That is the same reasoning as ADR-082: a clock face has
 * no zone, so we do not let the browser invent one.
 */
import { z } from 'zod'
import { optionalText, requiredText, uuid } from './common'
import {
  AUDIENCES,
  POPULATION_AUDIENCES,
  checkTarget,
  findDuplicateTargets,
  targetKey,
  type Audience,
} from '@/server/notices/notice-policy'

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export const NOTICE_CATEGORIES = ['GENERAL', 'ACADEMIC', 'EXAM', 'EVENT', 'EMERGENCY', 'HOLIDAY'] as const
export type NoticeCategoryValue = (typeof NOTICE_CATEGORIES)[number]

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategoryValue, string> = {
  GENERAL: 'General',
  ACADEMIC: 'Academic',
  EXAM: 'Examination',
  EVENT: 'Event',
  EMERGENCY: 'Emergency',
  HOLIDAY: 'Holiday',
}

export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type PublishStatusValue = (typeof PUBLISH_STATUSES)[number]

export const PUBLISH_STATUS_LABEL: Record<PublishStatusValue, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const
export type EventStatusValue = (typeof EVENT_STATUSES)[number]

export const EVENT_STATUS_LABEL: Record<EventStatusValue, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
}

export type AudienceValue = Audience
export { AUDIENCES, POPULATION_AUDIENCES }

export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: 'Everyone',
  STUDENTS: 'All students',
  STAFF: 'All staff',
  CLASS: 'A class',
  DIVISION: 'A division',
  PROGRAM: 'A programme',
  GROUP: 'A group',
  SECTION: 'A section',
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

const optionalOf = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .transform((value) => (value === '' ? undefined : (value as z.infer<T>)))
    .optional()

/**
 * A moment on the college's clock: `2026-09-08T08:00`, as an
 * `<input type="datetime-local">` sends it. No zone, no seconds. The server
 * converts it with APP_TIMEZONE; the browser never does.
 */
export const collegeLocalDateTime = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/,
    'Use a date and time such as 2026-09-08T08:00.',
  )
  .refine((value) => !Number.isNaN(new Date(`${value}:00Z`).getTime()), {
    message: 'That is not a real date.',
  })

export const audience = z.enum(AUDIENCES, { error: 'Choose who this is for.' })
export const noticeCategory = z.enum(NOTICE_CATEGORIES, { error: 'Choose a category.' })

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One audience of a notice. The rule that the ids match the audience lives in
 * the policy (`checkTarget`) and is applied here so the form can point at the
 * exact field; the database enforces the same rule again.
 */
export const noticeTargetSchema = z
  .object({
    audience,
    classId: optionalOf(uuid),
    divisionId: optionalOf(uuid),
    programId: optionalOf(uuid),
    academicGroupId: optionalOf(uuid),
    sectionId: optionalOf(uuid),
  })
  .superRefine((target, ctx) => {
    const verdict = checkTarget(target)
    if (!verdict.ok) {
      ctx.addIssue({ code: 'custom', path: [verdict.field], message: verdict.message })
    }
  })

export type NoticeTargetInput = z.infer<typeof noticeTargetSchema>

/* -------------------------------------------------------------------------- */
/* Notices                                                                    */
/* -------------------------------------------------------------------------- */

const noticeFields = {
  title: requiredText(200, 'Title'),
  body: requiredText(10_000, 'The notice'),
  category: noticeCategory.default('GENERAL'),
  isPinned: z.boolean().default(false),
  /** When to start showing it. Empty means "as soon as it is published". */
  publishAt: optionalOf(collegeLocalDateTime),
  /** When to stop. Empty means "until it is archived". */
  expiresAt: optionalOf(collegeLocalDateTime),
  targets: z
    .array(noticeTargetSchema)
    .min(1, 'Choose at least one audience.')
    .max(50, 'That is more audiences than one notice needs.'),
}

const noticeRules = <S extends z.ZodType<{ targets: NoticeTargetInput[]; publishAt?: string; expiresAt?: string }>>(
  schema: S,
) =>
  schema
    .refine((n) => findDuplicateTargets(n.targets).length === 0, {
      message: 'The same audience is listed twice.',
      path: ['targets'],
    })
    .refine((n) => !n.publishAt || !n.expiresAt || n.expiresAt > n.publishAt, {
      message: 'A notice cannot expire before it is published.',
      path: ['expiresAt'],
    })

export const noticeCreateSchema = noticeRules(z.object(noticeFields))
/** An update sends the whole notice again, targets included; they are replaced. */
export const noticeUpdateSchema = noticeCreateSchema
export type NoticeInput = z.infer<typeof noticeCreateSchema>

export const noticeStatusSchema = z.object({
  status: z.enum(PUBLISH_STATUSES, { error: 'Choose draft, published or archived.' }),
})
export type NoticeStatusInput = z.infer<typeof noticeStatusSchema>

/** The office's list: everything, filtered. */
export const noticeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  status: optionalOf(z.enum(PUBLISH_STATUSES)),
  category: optionalOf(noticeCategory),
})
export type NoticeListQuery = z.infer<typeof noticeListQuerySchema>

/**
 * A reader's feed. There is deliberately no status, no audience and no id of
 * anybody else's here: what a reader sees is decided by who they are, and the
 * only narrowing they get is by category.
 */
export const noticeFeedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  category: optionalOf(noticeCategory),
})
export type NoticeFeedQuery = z.infer<typeof noticeFeedQuerySchema>

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const eventAudience = z.enum(POPULATION_AUDIENCES, {
  error: 'An event is for everyone, all students or all staff.',
})

export const eventCreateSchema = z
  .object({
    title: requiredText(200, 'Title'),
    description: optionalText(5_000),
    startsAt: collegeLocalDateTime,
    endsAt: optionalOf(collegeLocalDateTime),
    location: optionalText(200),
    audience: eventAudience.default('ALL'),
  })
  .refine((e) => !e.endsAt || e.endsAt >= e.startsAt, {
    message: 'An event cannot end before it starts.',
    path: ['endsAt'],
  })
export const eventUpdateSchema = eventCreateSchema
export type EventInput = z.infer<typeof eventCreateSchema>

export const eventStatusSchema = z.object({
  status: z.enum(EVENT_STATUSES, { error: 'Choose draft, published or cancelled.' }),
})
export type EventStatusInput = z.infer<typeof eventStatusSchema>

/** Which of the event's own pictures is the cover; null clears it. */
export const eventCoverSchema = z.object({
  documentId: z.union([uuid, z.null()]),
})
export type EventCoverInput = z.infer<typeof eventCoverSchema>

export const eventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  status: optionalOf(z.enum(EVENT_STATUSES)),
  /** Only events that have not finished yet. */
  upcoming: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
})
export type EventListQuery = z.infer<typeof eventListQuerySchema>

/** A reader's events: upcoming by default, with the past available on request. */
export const eventFeedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  includePast: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
})
export type EventFeedQuery = z.infer<typeof eventFeedQuerySchema>

/** Re-exported so forms can de-duplicate rows the same way the server does. */
export { targetKey }

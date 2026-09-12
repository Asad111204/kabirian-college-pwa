/**
 * Timetable validation, shared by the browser and the server.
 *
 * The browser copy gives instant feedback; this copy is the security boundary
 * (requirement 40). It settles the *shape* of a lesson — a real day, a real
 * teaching period, ids that look like ids — but not whether the subject is on
 * the section's curriculum, whether the teacher is assigned to it, or whether
 * the cell is free. Those need the database, so the service asks
 * `timetable-policy.ts` after it has looked the facts up.
 *
 * Note what is **not** here: no `academicSessionId`, and no `staffId` for the
 * teacher's own views. A lesson's session comes from its section, and a
 * teacher's identity comes from their session cookie. Neither is something the
 * browser gets to assert.
 */
import { z } from 'zod'
import { optionalText, uuid } from './common'
import { MAX_PERIOD_NUMBER } from '@/server/timetable/periods'

/* -------------------------------------------------------------------------- */
/* Days                                                                       */
/* -------------------------------------------------------------------------- */

/** Mirrors the `DayOfWeek` enum. */
export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const

export type DayOfWeekValue = (typeof DAYS_OF_WEEK)[number]

export const DAY_LABEL: Record<DayOfWeekValue, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
}

/** The days the timetable grid shows. The college does not teach on Sunday. */
export const TIMETABLE_DAYS: readonly DayOfWeekValue[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]

export const dayOfWeek = z.enum(DAYS_OF_WEEK, { error: 'Choose a day.' })

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A period number.
 *
 * Only the shape is checked here — that it is a whole number inside the range
 * a college day could possibly have. *Which* numbers exist is the college's
 * own grid, which lives in the database and can be edited, so the service
 * checks it against that rather than this file pretending to know.
 */
export const teachingPeriod = z.coerce
  .number({ error: 'Choose a period.' })
  .int('Choose a period.')
  .min(1, 'Choose a period.')
  .max(MAX_PERIOD_NUMBER, 'That is not a period of the school day.')

/** One row of the college's day, as the office edits it. */
export const collegePeriodSchema = z.object({
  period: z.coerce.number().int().min(1).max(MAX_PERIOD_NUMBER),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:30.'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00.'),
})

/** The whole day, sent and stored together. */
export const collegePeriodsSchema = z.object({
  periods: z
    .array(collegePeriodSchema)
    .min(1, 'A school day needs at least one period.')
    .max(MAX_PERIOD_NUMBER, 'That is more periods than a school day has.'),
})

export type CollegePeriodsInput = z.infer<typeof collegePeriodsSchema>

/* -------------------------------------------------------------------------- */
/* A lesson                                                                   */
/* -------------------------------------------------------------------------- */

export const timetableSlotCreateSchema = z.object({
  /**
   * Optional, and never authoritative. A lesson's session is its sections'; if
   * the caller sends one it is *checked against* them rather than used, so a
   * request that disagrees with the database is refused instead of quietly
   * filed under the wrong year.
   */
  academicSessionId: uuid.optional(),
  /**
   * Every section this one lesson covers.
   *
   * One is the ordinary case. Several is a class taught together — a column of
   * the college's printed timetable like "1st Year Girls Bio/Math" is two of
   * this system's sections in one room with one teacher — and writing it as
   * one lesson is what keeps the teacher from clashing with themselves.
   */
  sectionIds: z
    .array(uuid)
    .min(1, 'Choose at least one section.')
    .max(20, 'That is more sections than one lesson can hold.'),
  subjectId: uuid,
  staffId: uuid,
  dayOfWeek,
  period: teachingPeriod,
  room: optionalText(50),
})

export type TimetableSlotCreateInput = z.infer<typeof timetableSlotCreateSchema>

/**
 * Editing a cell changes what happens in it, not where it is.
 *
 * Moving a lesson to a different day or period is clearing one cell and filling
 * another, which is two deliberate actions rather than one silent one — and it
 * keeps the clash checks honest, because each of those actions is checked.
 */
export const timetableSlotUpdateSchema = z.object({
  subjectId: uuid,
  staffId: uuid,
  room: optionalText(50),
  /** Which sections sit in it may change; where it is in the week may not. */
  sectionIds: z
    .array(uuid)
    .min(1, 'Choose at least one section.')
    .max(20, 'That is more sections than one lesson can hold.'),
})

export type TimetableSlotUpdateInput = z.infer<typeof timetableSlotUpdateSchema>

/**
 * Copying one day of the week onto others.
 *
 * A college week repeats: Monday, Wednesday and Friday are often the same day
 * three times over, and typing it out three times is both a chore and three
 * chances to get it wrong.
 *
 * `replace` is deliberate rather than assumed. Copying onto a day that already
 * has lessons is refused unless the office says to overwrite it, because
 * quietly discarding somebody's afternoon would be worse than making them
 * press the button twice.
 */
export const timetableCopyDaySchema = z
  .object({
    sectionId: uuid,
    fromDay: dayOfWeek,
    toDays: z
      .array(dayOfWeek)
      .min(1, 'Choose at least one day to copy on to.')
      .max(TIMETABLE_DAYS.length, 'That is more days than the school week has.'),
    /** Clear each target day first. Without it, a day with lessons is refused. */
    replace: z.boolean().default(false),
  })
  .refine((data) => !data.toDays.includes(data.fromDay), {
    message: 'A day cannot be copied onto itself.',
    path: ['toDays'],
  })

export type TimetableCopyDayInput = z.infer<typeof timetableCopyDaySchema>

/**
 * What the office is looking at.
 *
 * The session is required: a timetable only means anything inside one. Section
 * and day narrow it; `includeInactive` brings back the lessons that have been
 * removed from cells, which the office needs for history and nobody else does.
 */
export const timetableListQuerySchema = z.object({
  academicSessionId: uuid,
  sectionId: uuid.optional(),
  dayOfWeek: dayOfWeek.optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
})

export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>

/**
 * A teacher narrowing their own week.
 *
 * There is deliberately no `staffId` here. Whose timetable this is comes from
 * the session cookie and nowhere else, so there is no field to forge — and the
 * session id below is a filter, never an authority.
 */
export const myTimetableQuerySchema = z.object({
  academicSessionId: uuid.optional(),
  dayOfWeek: dayOfWeek.optional(),
})

export type MyTimetableQuery = z.infer<typeof myTimetableQuerySchema>

/** Which session the builder is looking at. Optional: the current one by default. */
export const timetableOptionsQuerySchema = z.object({
  sessionId: uuid.optional(),
})

export type TimetableOptionsQuery = z.infer<typeof timetableOptionsQuerySchema>

/** Which section's week the builder is editing. */
export const sectionTimetableQuerySchema = z.object({
  sectionId: uuid,
})

export type SectionTimetableQuery = z.infer<typeof sectionTimetableQuerySchema>

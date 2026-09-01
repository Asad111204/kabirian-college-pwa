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
import { PERIODS } from '@/server/timetable/periods'

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

const PERIOD_NUMBERS = PERIODS.map((p) => p.period)
const BREAK_PERIOD_NUMBERS = PERIODS.filter((p) => p.isBreak).map((p) => p.period)
const FIRST = PERIODS[0]!.period
const LAST = PERIODS[PERIODS.length - 1]!.period

/**
 * A period a lesson may occupy.
 *
 * The break is refused here as well as in the policy, so the form can say why
 * before the request is made. The policy is still the authority — this is the
 * convenience copy.
 */
export const teachingPeriod = z.coerce
  .number({ error: 'Choose a period.' })
  .int('Choose a period.')
  .min(FIRST, `Periods run from ${FIRST} to ${LAST}.`)
  .max(LAST, `Periods run from ${FIRST} to ${LAST}.`)
  // "Not a period" first, then "is the break" — otherwise a request for period
  // 6 collects both messages and the second one is simply untrue.
  .refine((value) => PERIOD_NUMBERS.includes(value), {
    message: 'That is not a period of the college day.',
  })
  .refine((value) => !BREAK_PERIOD_NUMBERS.includes(value), {
    message: 'That period is the college break and cannot be timetabled.',
  })

/* -------------------------------------------------------------------------- */
/* A lesson                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `room` is free text — the college has no room table — and an empty box means
 * "not decided yet", which is allowed and clashes with nothing.
 */
export const timetableSlotCreateSchema = z.object({
  /**
   * Optional, and never authoritative. A lesson's session is its section's; if
   * the caller sends one it is *checked against* the section rather than used,
   * so a request that disagrees with the database is refused instead of
   * quietly filed under the wrong year.
   */
  academicSessionId: uuid.optional(),
  sectionId: uuid,
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
})

export type TimetableSlotUpdateInput = z.infer<typeof timetableSlotUpdateSchema>

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

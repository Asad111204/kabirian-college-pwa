/**
 * The college's fixed daily period grid.
 *
 * Kabirian rings the same bells every day, so the clock times are a property of
 * the college, not of each timetable row. They live here as a plain constant:
 *
 *   - `TimetableSlot` stores only a period *number*. Moving a bell is one edit
 *     in this file, not an UPDATE across every lesson in the week.
 *   - The break is a period like any other, flagged `isBreak`. It is never a
 *     row in the database with a made-up subject and a made-up teacher.
 *   - The numbering is the one `AttendanceSheet.period` already records, so the
 *     register for period 3 is the register for the lesson the timetable puts
 *     in period 3.
 *
 * Nothing here touches the database or the request, and there is no
 * `server-only` import, so the admin builder and the teacher's own week can
 * both read it — the same arrangement as `exams/exam-policy.ts`, which the
 * exam screens already import on the client.
 */

/** One period of the college day. */
export interface CollegePeriod {
  /** 1-based. The value stored in `TimetableSlot.period`. */
  period: number
  /** Start of the period, `HH:MM`, 24-hour, in the college's own timezone. */
  start: string
  /** End of the period, `HH:MM`, 24-hour. */
  end: string
  /** True for the daily break: nothing may be timetabled in it. */
  isBreak: boolean
}

/**
 * The grid as the college runs it today.
 *
 * The gaps after periods 2 and 3 (09:00–09:10 and 10:00–10:10) are the
 * college's own — they are movement time between lessons, not periods, and are
 * left as gaps rather than invented into the grid.
 *
 * The last period runs to 13:20; the college writes it as 1:20, which is the
 * same afternoon time in 24-hour form.
 */
export const PERIODS: readonly CollegePeriod[] = [
  { period: 1, start: '08:00', end: '08:30', isBreak: false },
  { period: 2, start: '08:30', end: '09:00', isBreak: false },
  { period: 3, start: '09:10', end: '10:00', isBreak: false },
  { period: 4, start: '10:10', end: '10:40', isBreak: false },
  { period: 5, start: '10:40', end: '11:10', isBreak: false },
  { period: 6, start: '11:10', end: '11:40', isBreak: true },
  { period: 7, start: '11:40', end: '12:10', isBreak: false },
  { period: 8, start: '12:10', end: '12:40', isBreak: false },
  { period: 9, start: '12:40', end: '13:20', isBreak: false },
] as const

/** The periods a lesson may actually be put in — the grid without the break. */
export const TEACHING_PERIODS: readonly CollegePeriod[] = PERIODS.filter((p) => !p.isBreak)

/** The period with this number, or `null` if the grid has no such period. */
export function findPeriod(period: number): CollegePeriod | null {
  return PERIODS.find((p) => p.period === period) ?? null
}

/** Whether this number is a period of the college day at all. */
export function isValidPeriodNumber(period: number): boolean {
  return findPeriod(period) !== null
}

/**
 * Whether this period is the break.
 *
 * A number outside the grid is not the break — it is not a period. Callers that
 * care about both ask `isValidPeriodNumber` first.
 */
export function isBreakPeriod(period: number): boolean {
  return findPeriod(period)?.isBreak === true
}

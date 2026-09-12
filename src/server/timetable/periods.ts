/**
 * The college's daily period grid.
 *
 * `TimetableSlot` stores only a period *number*. The clock times are a
 * property of the college, not of every lesson in the week, so moving a bell
 * is one edit rather than an UPDATE across nine hundred rows. The numbering is
 * the one `AttendanceSheet.period` already records, so the register for period
 * 3 is the register for the lesson this grid puts in period 3.
 *
 * The grid used to be a constant in this file, with one period flagged as the
 * break and nothing allowed to be timetabled in it. The college asked for both
 * to go: the times are theirs to change, and a break is simply a period they
 * choose not to fill — which needs no flag, no rule and no explaining. What is
 * left here is the shape, the default the college started with, and the pure
 * functions that read a grid. Which grid is in force comes from the database
 * (`period-settings.ts`).
 *
 * Nothing here touches the database or the request, and there is no
 * `server-only` import, so the admin builder and a teacher's own week can both
 * read it — the same arrangement as `exams/exam-policy.ts`.
 */

/** One period of the college day. */
export interface CollegePeriod {
  /** 1-based. The value stored in `TimetableSlot.period`. */
  period: number
  /** Start of the period, `HH:MM`, 24-hour, in the college's own timezone. */
  start: string
  /** End of the period, `HH:MM`, 24-hour. */
  end: string
}

/**
 * The grid the college began with, used until the office changes it.
 *
 * The gaps after periods 2 and 3 (09:00–09:10 and 10:00–10:10) are the
 * college's own — movement time between lessons, not periods, and left as gaps
 * rather than invented into the grid. Period 6 was the break; it is an
 * ordinary period now, and the office may fill it, move it or delete it.
 *
 * The last period runs to 13:20, which is the 1:20 the college writes.
 */
export const DEFAULT_PERIODS: readonly CollegePeriod[] = [
  { period: 1, start: '08:00', end: '08:30' },
  { period: 2, start: '08:30', end: '09:00' },
  { period: 3, start: '09:10', end: '10:00' },
  { period: 4, start: '10:10', end: '10:40' },
  { period: 5, start: '10:40', end: '11:10' },
  { period: 6, start: '11:10', end: '11:40' },
  { period: 7, start: '11:40', end: '12:10' },
  { period: 8, start: '12:10', end: '12:40' },
  { period: 9, start: '12:40', end: '13:20' },
] as const

/** The highest period number the college may define. */
export const MAX_PERIOD_NUMBER = 20

/** The period with this number in a given grid, or `null`. */
export function findPeriodIn(periods: readonly CollegePeriod[], period: number): CollegePeriod | null {
  return periods.find((p) => p.period === period) ?? null
}

/** Whether this number is a period of the day in a given grid. */
export function isValidPeriodIn(periods: readonly CollegePeriod[], period: number): boolean {
  return findPeriodIn(periods, period) !== null
}

/** `HH:MM`, 24-hour, as the grid stores a time. */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Minutes since midnight, for comparing two clock times. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/** How long a period runs, in minutes. */
export function lengthOf(period: CollegePeriod): number {
  return minutesOf(period.end) - minutesOf(period.start)
}

/**
 * Everything wrong with a proposed grid, in the office's words.
 *
 * A grid that overlaps itself would put a teacher in two lessons at one
 * moment while every clash rule reported it as fine, because those rules
 * compare period *numbers* and would see two different ones. Overlap is
 * therefore refused here rather than left to be discovered from a timetable
 * that looks correct.
 */
export function problemsWithGrid(periods: readonly CollegePeriod[]): string[] {
  const problems: string[] = []

  if (periods.length === 0) return ['A school day needs at least one period.']

  const seen = new Set<number>()
  for (const period of periods) {
    if (!Number.isInteger(period.period) || period.period < 1 || period.period > MAX_PERIOD_NUMBER) {
      problems.push(`Period ${period.period} is not a period number between 1 and ${MAX_PERIOD_NUMBER}.`)
      continue
    }
    if (seen.has(period.period)) problems.push(`Period ${period.period} is listed twice.`)
    seen.add(period.period)

    if (!isClockTime(period.start) || !isClockTime(period.end)) {
      problems.push(`Period ${period.period} needs a start and end time as HH:MM.`)
      continue
    }
    if (minutesOf(period.end) <= minutesOf(period.start)) {
      problems.push(`Period ${period.period} ends before it starts.`)
    }
  }

  // Overlaps, checked in clock order rather than in the order they were sent.
  const ordered = [...periods]
    .filter((period) => isClockTime(period.start) && isClockTime(period.end))
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))

  for (let at = 1; at < ordered.length; at += 1) {
    const previous = ordered[at - 1]!
    const current = ordered[at]!
    if (minutesOf(current.start) < minutesOf(previous.end)) {
      problems.push(`Period ${previous.period} and period ${current.period} overlap.`)
    }
  }

  return problems
}

/** A grid in the order the day runs, whatever order it was stored in. */
export function inClockOrder(periods: readonly CollegePeriod[]): CollegePeriod[] {
  return [...periods].sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
}

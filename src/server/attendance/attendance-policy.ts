/**
 * The attendance rules, as pure functions.
 *
 * Nothing here touches the database or the request. That is deliberate: these
 * are the rules a college argues about — what counts as present, who may mark a
 * register for last Tuesday — and rules like that need to be readable in one
 * place and testable without a database.
 *
 * The service does the lookups and calls these; the routes call the service.
 */

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which class of the day a register belongs to.
 *
 * The college has no period table and does not need one yet, so a period is
 * just a number. The range is generous enough for any timetable and small
 * enough that a typo like 500 is refused.
 */
export const PERIOD_MIN = 1
export const PERIOD_MAX = 20

export function isValidPeriod(period: number): boolean {
  return Number.isInteger(period) && period >= PERIOD_MIN && period <= PERIOD_MAX
}

/* -------------------------------------------------------------------------- */
/* Which dates may be marked                                                  */
/* -------------------------------------------------------------------------- */

export type DateRuleResult =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * Whether `date` may have a register created for it.
 *
 * The college had no rule for this, so this is the conservative one:
 *
 *   - **Nobody** may mark a future date. Attendance is a record of what
 *     happened, and a register for next Tuesday is a guess.
 *   - **Teachers** may mark today only. A teacher who forgets asks the office,
 *     which leaves a trail; a teacher who can silently backfill last month can
 *     rewrite a term.
 *   - **Administrators** may mark any past date, because entering a paper
 *     register after the fact is real office work.
 *
 * `TEACHER_BACKDATE_DAYS` is here so the college can widen the teacher window
 * later by changing one number rather than hunting through the service.
 */
export const TEACHER_BACKDATE_DAYS = 0

export function checkAttendanceDate(args: {
  date: string
  today: string
  isAdmin: boolean
}): DateRuleResult {
  const { date, today, isAdmin } = args

  if (date > today) {
    return { allowed: false, reason: 'Attendance cannot be marked for a future date.' }
  }

  if (isAdmin) return { allowed: true }

  if (TEACHER_BACKDATE_DAYS === 0) {
    if (date !== today) {
      return {
        allowed: false,
        reason:
          'Teachers can only mark attendance for today. Ask the office to enter attendance for an earlier date.',
      }
    }
    return { allowed: true }
  }

  const earliest = shiftDate(today, -TEACHER_BACKDATE_DAYS)
  if (date < earliest) {
    return {
      allowed: false,
      reason: `Teachers can only mark attendance for the last ${TEACHER_BACKDATE_DAYS} day(s). Ask the office to enter anything older.`,
    }
  }
  return { allowed: true }
}

/** Moves a YYYY-MM-DD date by a number of days, staying on the calendar. */
export function shiftDate(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`)
  moved.setUTCDate(moved.getUTCDate() + days)
  return moved.toISOString().slice(0, 10)
}

/* -------------------------------------------------------------------------- */
/* Counting attendance                                                        */
/* -------------------------------------------------------------------------- */

export type AttendanceStatusName = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'

export interface AttendanceCounts {
  present: number
  absent: number
  late: number
  leave: number
}

export interface AttendanceSummary extends AttendanceCounts {
  /** Every session that counted towards the percentage. */
  total: number
  /** Sessions treated as attended. */
  attended: number
  /** 0–100, rounded to one decimal place. `null` when there is nothing yet. */
  percentage: number | null
}

export const EMPTY_COUNTS: AttendanceCounts = { present: 0, absent: 0, late: 0, leave: 0 }

/**
 * Turns counts into a summary.
 *
 * **LATE counts as attended.** The student was in the room. It is stored as its
 * own status so a pattern of lateness stays visible, and so a future "three
 * lates make an absence" rule needs no migration.
 *
 * **LEAVE lowers the percentage** by default — it is in the denominator but not
 * the numerator. The college can flip that with the `attendance.leave_counts_
 * as_present` setting, which has existed since Phase 1.
 *
 * A student with no sessions gets `null`, not `0`. Zero would read as "never
 * attends" on a report, which is a different and much worse claim than "we have
 * not held any classes yet" (ADR-079).
 */
export function summarise(
  counts: AttendanceCounts,
  options: { leaveCountsAsPresent?: boolean } = {},
): AttendanceSummary {
  const leaveCountsAsPresent = options.leaveCountsAsPresent ?? false

  const total = counts.present + counts.absent + counts.late + counts.leave
  const attended = counts.present + counts.late + (leaveCountsAsPresent ? counts.leave : 0)

  return {
    ...counts,
    total,
    attended,
    percentage: total === 0 ? null : Math.round((attended / total) * 1000) / 10,
  }
}

/** Adds up a list of statuses. Used when entries are already in memory. */
export function countStatuses(statuses: readonly AttendanceStatusName[]): AttendanceCounts {
  const counts: AttendanceCounts = { ...EMPTY_COUNTS }
  for (const status of statuses) {
    if (status === 'PRESENT') counts.present += 1
    else if (status === 'ABSENT') counts.absent += 1
    else if (status === 'LATE') counts.late += 1
    else counts.leave += 1
  }
  return counts
}

/**
 * Turns Prisma's `groupBy` rows into counts.
 * Anything not recognised is ignored rather than silently counted as absent.
 */
export function countsFromGroups(
  groups: ReadonlyArray<{ status: string; _count: { _all: number } }>,
  startingFrom: AttendanceCounts = EMPTY_COUNTS,
): AttendanceCounts {
  const counts: AttendanceCounts = { ...startingFrom }
  for (const group of groups) {
    const n = group._count._all
    if (group.status === 'PRESENT') counts.present += n
    else if (group.status === 'ABSENT') counts.absent += n
    else if (group.status === 'LATE') counts.late += n
    else if (group.status === 'LEAVE') counts.leave += n
  }
  return counts
}

/**
 * Only SUBMITTED sheets count towards an official percentage.
 *
 * A DRAFT is a teacher still working — counting it would report a figure that
 * changes under the reader. A CANCELLED sheet is a class that did not happen;
 * counting it would mark a whole section absent for a public holiday.
 *
 * Every reporting query filters on this, so the rule lives in one constant
 * rather than being retyped into each `where` clause.
 */
export const COUNTED_SHEET_STATUS = 'SUBMITTED' as const

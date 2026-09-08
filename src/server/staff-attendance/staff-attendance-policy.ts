/**
 * Staff attendance: what the four statuses mean, and how a month is counted.
 *
 * Pure functions with no database, in the shape of `attendance-policy.ts`.
 * The college's rule, confirmed for this phase:
 *
 *   PRESENT      at work
 *   SHORT_LEAVE  at work for part of the day, with permission — counted as a
 *                day at work, and kept separate so a pattern stays visible
 *   LEAVE        approved absence — not at work, but not held against them
 *   ABSENT       not at work, without approved leave
 *
 * The percentage answers "how much of the month was worked", so PRESENT and
 * SHORT_LEAVE count towards it and days of approved LEAVE come out of the
 * denominator altogether — a teacher on sanctioned leave is not marked down
 * for it. ABSENT lowers it. Days nobody marked are not counted at all: an
 * unmarked day is a day the office did not take the register, not a day
 * anybody was away.
 */

export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'SHORT_LEAVE', 'LEAVE'] as const
export type StaffAttendanceStatusValue = (typeof STAFF_ATTENDANCE_STATUSES)[number]

export const STAFF_ATTENDANCE_STATUS_LABEL: Record<StaffAttendanceStatusValue, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  SHORT_LEAVE: 'Short leave',
  LEAVE: 'Leave',
}

export interface StaffAttendanceCounts {
  present: number
  absent: number
  shortLeave: number
  leave: number
  /** Days with a mark of any kind. */
  marked: number
}

export const EMPTY_STAFF_COUNTS: StaffAttendanceCounts = { present: 0, absent: 0, shortLeave: 0, leave: 0, marked: 0 }

export function countStaffStatuses(statuses: readonly StaffAttendanceStatusValue[]): StaffAttendanceCounts {
  const counts = { ...EMPTY_STAFF_COUNTS }
  for (const status of statuses) {
    counts.marked += 1
    if (status === 'PRESENT') counts.present += 1
    else if (status === 'ABSENT') counts.absent += 1
    else if (status === 'SHORT_LEAVE') counts.shortLeave += 1
    else counts.leave += 1
  }
  return counts
}

/**
 * How much of the marked month was worked, as a percentage to one decimal —
 * or null when there is nothing to count. Approved leave is left out of the
 * reckoning rather than counted against the person.
 */
export function staffAttendancePercentage(counts: StaffAttendanceCounts): number | null {
  const considered = counts.present + counts.shortLeave + counts.absent
  if (considered === 0) return null
  return Math.round(((counts.present + counts.shortLeave) / considered) * 1000) / 10
}

/**
 * May the office mark this day?
 *
 * The only rule the college has: not the future. A register for next Tuesday
 * is a guess, exactly as it is for students (ADR-078). Backdating is ordinary
 * office work — a paper register keyed in on Monday morning — and is audited
 * like every other change.
 */
export type StaffDateDecision = { allowed: true } | { allowed: false; reason: string }

export function checkStaffAttendanceDate(date: string, today: string): StaffDateDecision {
  if (date > today) {
    return { allowed: false, reason: 'Staff attendance cannot be marked for a future date.' }
  }
  return { allowed: true }
}

/**
 * Whether a staff member should appear on the register for a given day.
 *
 * Somebody who joined after that date, or left before it, was not employed
 * then — their name on that day's register would be a question nobody can
 * answer. Everyone else appears, whatever their current employment status,
 * so a person who resigned in March still shows on January's register.
 */
export function wasEmployedOn(staff: { joiningDate: string; leavingDate: string | null }, date: string): boolean {
  if (date < staff.joiningDate) return false
  return staff.leavingDate === null || date <= staff.leavingDate
}

/**
 * Calendar dates in the college's own timezone.
 *
 * Attendance is not a moment in time — it is a *day*. "Was Ali present on
 * 1 September?" has one answer, and it must not depend on where the server
 * happens to be running.
 *
 * This matters more than it sounds. `APP_TIMEZONE` has been in .env since
 * Phase 1 but nothing used it, and until now nothing needed to: no feature
 * asked what day it was. Every date so far (admission, joining, enrollment
 * start) was typed in by a person. Attendance is the first feature where the
 * server decides the date itself.
 *
 * Pakistan is UTC+5. A server running in UTC — which is the default almost
 * everywhere you would deploy this — rolls over to the next day at 5am Pakistan
 * time. Attendance marked during an evening class would be filed on tomorrow's
 * date, and nobody would notice until the monthly report looked wrong. On a
 * developer machine in Karachi the bug is completely invisible.
 *
 * So: every attendance date goes through this file.
 */
import 'server-only'
import { env } from '../config/env'

/** A calendar date with no time and no zone, as `YYYY-MM-DD`. */
export type CollegeDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `en-CA` formats as `YYYY-MM-DD`, which is the format we want to store and
 * compare. Built once — creating a formatter is not free.
 */
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Today's date in the college's timezone, as `YYYY-MM-DD`.
 *
 * Use this instead of `new Date()` anywhere the answer is a calendar day.
 */
export function todayInCollegeTimezone(now: Date = new Date()): CollegeDate {
  return dateFormatter.format(now)
}

/** Which calendar day a given moment falls on, in the college's timezone. */
export function toCollegeDate(instant: Date): CollegeDate {
  return dateFormatter.format(instant)
}

/** True for a well-formed, real calendar date such as `2026-09-01`. */
export function isValidCollegeDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const asDate = new Date(Date.UTC(year, month - 1, day))

  // Rejects 2026-02-30, which JavaScript would otherwise roll into March.
  return (
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day
  )
}

/**
 * Turns `YYYY-MM-DD` into the value to store in a PostgreSQL `date` column.
 *
 * Midnight **UTC** is used deliberately. A `date` column holds no timezone, and
 * anchoring at UTC midnight means the day can never shift when the value is
 * serialised, sent to the database, or read back on a machine in another zone.
 * Anchoring at local midnight is the classic way to lose a day.
 */
export function collegeDateToStorage(date: CollegeDate): Date {
  if (!isValidCollegeDate(date)) {
    throw new Error(`Not a valid calendar date: ${date}`)
  }
  return new Date(`${date}T00:00:00.000Z`)
}

/** Reads a `date` column back as `YYYY-MM-DD`, without shifting the day. */
export function storageToCollegeDate(value: Date): CollegeDate {
  return value.toISOString().slice(0, 10)
}

/** True when `date` is after today in the college's timezone. */
export function isFutureCollegeDate(date: CollegeDate, now: Date = new Date()): boolean {
  return date > todayInCollegeTimezone(now)
}

/** The timezone these functions use, for display and health checks. */
export const collegeTimezone = env.APP_TIMEZONE

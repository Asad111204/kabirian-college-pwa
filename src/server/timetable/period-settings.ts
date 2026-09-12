/**
 * The grid the college is actually running, and changing it.
 *
 * Held as one setting rather than a table of its own: it is a handful of rows
 * the office edits together and reads as a whole, and a lesson refers to a
 * period by *number* rather than by a foreign key, so there is nothing for a
 * table to enforce that this does not.
 *
 * The one rule that matters when a grid changes: **a period that lessons or
 * registers already refer to cannot be taken away.** Its number is written on
 * timetable rows, attendance sheets and exam papers, and removing it would
 * leave those pointing at an hour of the day that no longer exists. Moving its
 * clock times is fine — that is the whole point — but the number stays.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { readSetting, writeSetting } from '../settings/settings-store'
import { writeAuditLog } from '../audit/audit'
import { authorize, type AuthContext } from '../auth/context'
import { ConflictError, ValidationError } from '../api/errors'
import { assertAdminArea } from '../services/service-utils'
import { DEFAULT_PERIODS, inClockOrder, problemsWithGrid, type CollegePeriod } from './periods'

export const SETTING_TIMETABLE_PERIODS = 'timetable.periods'

/** Anything shaped like a stored period, before it is trusted. */
function looksLikeGrid(value: unknown): value is CollegePeriod[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        typeof (row as CollegePeriod).period === 'number' &&
        typeof (row as CollegePeriod).start === 'string' &&
        typeof (row as CollegePeriod).end === 'string',
    )
  )
}

/**
 * The college's periods, in the order the day runs.
 *
 * A stored grid that does not survive its own rules is ignored in favour of
 * the default: a timetable drawn from nonsense is worse than one drawn from
 * the arrangement the college started with, and the office can see and correct
 * the setting either way.
 */
export async function getCollegePeriods(): Promise<CollegePeriod[]> {
  const stored = await readSetting<unknown>(SETTING_TIMETABLE_PERIODS)
  if (!looksLikeGrid(stored) || problemsWithGrid(stored).length > 0) return inClockOrder(DEFAULT_PERIODS)

  return inClockOrder(
    stored.map((row) => ({ period: row.period, start: row.start, end: row.end })),
  )
}

/** Period numbers that something already refers to, and what refers to them. */
export async function periodsInUse(): Promise<Map<number, string[]>> {
  const [lessons, registers] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { isActive: true }, select: { period: true }, distinct: ['period'] }),
    prisma.attendanceSheet.findMany({ select: { period: true }, distinct: ['period'] }),
  ])

  const used = new Map<number, string[]>()
  const note = (period: number | null, what: string) => {
    if (period === null) return
    used.set(period, [...(used.get(period) ?? []), what])
  }

  for (const row of lessons) note(row.period, 'a lesson on the timetable')
  for (const row of registers) note(row.period, 'an attendance register')
  return used
}

/**
 * Replaces the grid.
 *
 * The whole grid is sent and the whole grid is stored — editing the day is one
 * decision, not nine, and a half-applied change would leave the college with
 * overlapping periods between two saves.
 */
export async function setCollegePeriods(ctx: AuthContext, periods: CollegePeriod[]): Promise<CollegePeriod[]> {
  assertAdminArea(ctx, 'The college day')
  authorize(ctx, 'settings.manage')

  const problems = problemsWithGrid(periods)
  if (problems.length > 0) {
    throw new ValidationError(problems[0]!, { periods: problems })
  }

  const before = await getCollegePeriods()
  const keeping = new Set(periods.map((period) => period.period))
  const used = await periodsInUse()

  // A period something already points at cannot be taken away; its times may
  // move as much as the college likes.
  const removed = [...used.keys()].filter((period) => !keeping.has(period))
  if (removed.length > 0) {
    const first = removed[0]!
    throw new ConflictError(
      `Period ${first} cannot be removed: it still has ${used.get(first)![0]}. Change its times instead, or clear what is in it first.`,
      { periods: removed.map((period) => `Period ${period} is still in use by ${used.get(period)!.join(' and ')}.`) },
    )
  }

  const ordered = inClockOrder(periods)
  await prisma.$transaction(async (tx) => {
    await writeSetting(SETTING_TIMETABLE_PERIODS, ordered, ctx, {
      description: 'The college’s daily period grid: the number of each period and the times it runs',
      executor: tx,
    })
    await writeAuditLog(
      ctx,
      {
        action: 'timetable.periods_updated',
        entityType: 'setting',
        entityLabel: 'The college day',
        before,
        after: ordered,
      },
      tx,
    )
  })

  return ordered
}

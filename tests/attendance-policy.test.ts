import { describe, expect, it } from 'vitest'
import {
  PERIOD_MAX,
  PERIOD_MIN,
  checkAttendanceDate,
  countStatuses,
  countsFromGroups,
  isValidPeriod,
  shiftDate,
  summarise,
  type AttendanceCounts,
} from '@/server/attendance/attendance-policy'

/**
 * The attendance rules a college argues about: what counts as present, what a
 * percentage means, and who may mark which day.
 */

const counts = (present: number, absent: number, late = 0, leave = 0): AttendanceCounts => ({
  present,
  absent,
  late,
  leave,
})

describe('attendance percentage', () => {
  it('is 100% when every session was attended', () => {
    expect(summarise(counts(20, 0)).percentage).toBe(100)
  })

  it('is 0% when every session was missed', () => {
    expect(summarise(counts(0, 20)).percentage).toBe(0)
  })

  it('counts LATE as attended', () => {
    // The student was in the room.
    expect(summarise(counts(0, 0, 20, 0)).percentage).toBe(100)
  })

  it('handles the worked example from the design: 16 present, 2 late, 2 absent', () => {
    const result = summarise(counts(16, 2, 2, 0))
    expect(result.total).toBe(20)
    expect(result.attended).toBe(18)
    expect(result.percentage).toBe(90)
  })

  it('still records LATE separately, so a pattern stays visible', () => {
    const result = summarise(counts(16, 2, 2, 0))
    expect(result.late).toBe(2)
    expect(result.present).toBe(16)
  })

  it('rounds to one decimal place', () => {
    // 1 of 3 = 33.333…
    expect(summarise(counts(1, 2)).percentage).toBe(33.3)
    // 2 of 3 = 66.666…
    expect(summarise(counts(2, 1)).percentage).toBe(66.7)
  })
})

describe('how LEAVE is treated', () => {
  const mixed = counts(15, 2, 1, 2) // 20 sessions

  it('lowers the percentage by default', () => {
    const result = summarise(mixed)
    expect(result.total).toBe(20)
    expect(result.attended).toBe(16) // 15 present + 1 late
    expect(result.percentage).toBe(80)
  })

  it('counts as attended when the college setting says so', () => {
    const result = summarise(mixed, { leaveCountsAsPresent: true })
    expect(result.attended).toBe(18) // + the 2 leave days
    expect(result.percentage).toBe(90)
  })

  it('stays in the denominator either way', () => {
    expect(summarise(mixed).total).toBe(20)
    expect(summarise(mixed, { leaveCountsAsPresent: true }).total).toBe(20)
  })

  it('makes all-leave 0% by default and 100% when the setting is on', () => {
    expect(summarise(counts(0, 0, 0, 5)).percentage).toBe(0)
    expect(summarise(counts(0, 0, 0, 5), { leaveCountsAsPresent: true }).percentage).toBe(100)
  })
})

describe('a student with no sessions', () => {
  it('has no percentage rather than 0%', () => {
    // 0% would read as "never attends", which is a different and much worse
    // claim than "no classes have been held yet".
    const result = summarise(counts(0, 0))
    expect(result.total).toBe(0)
    expect(result.percentage).toBeNull()
  })
})

describe('counting statuses', () => {
  it('adds up a list of marks', () => {
    expect(countStatuses(['PRESENT', 'PRESENT', 'ABSENT', 'LATE', 'LEAVE'])).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      leave: 1,
    })
  })

  it('adds up grouped rows from the database', () => {
    expect(
      countsFromGroups([
        { status: 'PRESENT', _count: { _all: 10 } },
        { status: 'ABSENT', _count: { _all: 3 } },
        { status: 'LATE', _count: { _all: 2 } },
        { status: 'LEAVE', _count: { _all: 1 } },
      ]),
    ).toEqual({ present: 10, absent: 3, late: 2, leave: 1 })
  })

  it('ignores a status it does not recognise rather than miscounting it', () => {
    expect(
      countsFromGroups([
        { status: 'PRESENT', _count: { _all: 5 } },
        { status: 'SOMETHING_ELSE', _count: { _all: 99 } },
      ]),
    ).toEqual({ present: 5, absent: 0, late: 0, leave: 0 })
  })
})

describe('which dates may be marked', () => {
  const today = '2026-09-15'

  it('refuses a future date for everyone, including an administrator', () => {
    expect(checkAttendanceDate({ date: '2026-09-16', today, isAdmin: false })).toMatchObject({
      allowed: false,
    })
    expect(checkAttendanceDate({ date: '2026-09-16', today, isAdmin: true })).toMatchObject({
      allowed: false,
    })
  })

  it('lets a teacher mark today', () => {
    expect(checkAttendanceDate({ date: today, today, isAdmin: false }).allowed).toBe(true)
  })

  it('does not let a teacher mark yesterday', () => {
    const result = checkAttendanceDate({ date: '2026-09-14', today, isAdmin: false })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/office/i)
  })

  it('lets an administrator mark a past date', () => {
    expect(checkAttendanceDate({ date: '2026-08-01', today, isAdmin: true }).allowed).toBe(true)
  })

  it('lets an administrator mark today', () => {
    expect(checkAttendanceDate({ date: today, today, isAdmin: true }).allowed).toBe(true)
  })
})

describe('periods', () => {
  it('accepts the whole allowed range', () => {
    expect(isValidPeriod(PERIOD_MIN)).toBe(true)
    expect(isValidPeriod(PERIOD_MAX)).toBe(true)
    expect(isValidPeriod(5)).toBe(true)
  })

  it('refuses zero, negatives and anything absurd', () => {
    expect(isValidPeriod(0)).toBe(false)
    expect(isValidPeriod(-1)).toBe(false)
    expect(isValidPeriod(PERIOD_MAX + 1)).toBe(false)
    expect(isValidPeriod(1000)).toBe(false)
  })

  it('refuses a fraction', () => {
    expect(isValidPeriod(1.5)).toBe(false)
  })
})

describe('moving a date', () => {
  it('crosses a month boundary correctly', () => {
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('crosses a year boundary correctly', () => {
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles a leap day', () => {
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29')
  })
})

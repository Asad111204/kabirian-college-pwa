import { describe, expect, it } from 'vitest'
import {
  collegeDateToStorage,
  isFutureCollegeDate,
  isValidCollegeDate,
  storageToCollegeDate,
  toCollegeDate,
  todayInCollegeTimezone,
} from '@/server/time/college-date'

/**
 * Calendar dates in the college's timezone.
 *
 * The tests that matter here are the ones using a fixed instant: they prove the
 * answer comes from Asia/Karachi and not from whatever timezone the machine
 * running the tests happens to be in. On a developer machine in Karachi a broken
 * implementation would pass every other check.
 */

describe('what day is it in Pakistan', () => {
  it('uses the college timezone, not the machine timezone', () => {
    // 19:30 UTC on 1 September is already 00:30 on 2 September in Karachi.
    const instant = new Date('2026-09-01T19:30:00.000Z')
    expect(toCollegeDate(instant)).toBe('2026-09-02')
  })

  it('still says the 1st at 18:30 UTC, half an hour earlier', () => {
    expect(toCollegeDate(new Date('2026-09-01T18:30:00.000Z'))).toBe('2026-09-01')
  })

  it('handles the exact rollover moment', () => {
    // Pakistan is UTC+5 all year — no daylight saving to complicate this.
    expect(toCollegeDate(new Date('2026-09-01T18:59:59.999Z'))).toBe('2026-09-01')
    expect(toCollegeDate(new Date('2026-09-01T19:00:00.000Z'))).toBe('2026-09-02')
  })

  it('gets the year right across new year', () => {
    expect(toCollegeDate(new Date('2026-12-31T19:00:00.000Z'))).toBe('2027-01-01')
  })

  it('returns today in YYYY-MM-DD form', () => {
    expect(todayInCollegeTimezone()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('accepts an explicit instant, so callers can be tested', () => {
    expect(todayInCollegeTimezone(new Date('2026-09-01T12:00:00.000Z'))).toBe('2026-09-01')
  })
})

describe('validating a date', () => {
  it('accepts real dates', () => {
    expect(isValidCollegeDate('2026-09-01')).toBe(true)
    expect(isValidCollegeDate('2028-02-29')).toBe(true) // 2028 is a leap year
  })

  it('rejects dates that do not exist', () => {
    expect(isValidCollegeDate('2026-02-30')).toBe(false)
    expect(isValidCollegeDate('2027-02-29')).toBe(false) // 2027 is not a leap year
    expect(isValidCollegeDate('2026-13-01')).toBe(false)
    expect(isValidCollegeDate('2026-00-10')).toBe(false)
  })

  it('rejects anything that is not a plain calendar date', () => {
    for (const bad of ['', '2026-9-1', '01/09/2026', '2026-09-01T00:00:00Z', 'today', '20260901']) {
      expect(isValidCollegeDate(bad)).toBe(false)
    }
  })
})

describe('storing and reading a date column', () => {
  it('round-trips without shifting the day', () => {
    for (const date of ['2026-01-01', '2026-09-01', '2026-12-31', '2028-02-29']) {
      expect(storageToCollegeDate(collegeDateToStorage(date))).toBe(date)
    }
  })

  it('anchors at midnight UTC, so serialising can never move the day', () => {
    expect(collegeDateToStorage('2026-09-01').toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('refuses to store a date that does not exist', () => {
    expect(() => collegeDateToStorage('2026-02-30')).toThrow()
    expect(() => collegeDateToStorage('not-a-date')).toThrow()
  })
})

describe('is a date in the future', () => {
  const now = new Date('2026-09-01T12:00:00.000Z') // 17:00 in Karachi

  it('says tomorrow is', () => {
    expect(isFutureCollegeDate('2026-09-02', now)).toBe(true)
  })

  it('says today and yesterday are not', () => {
    expect(isFutureCollegeDate('2026-09-01', now)).toBe(false)
    expect(isFutureCollegeDate('2026-08-31', now)).toBe(false)
  })

  it('judges from the college timezone, not UTC', () => {
    // 19:30 UTC is already the 2nd in Karachi, so the 2nd is no longer future.
    const evening = new Date('2026-09-01T19:30:00.000Z')
    expect(isFutureCollegeDate('2026-09-02', evening)).toBe(false)
  })
})

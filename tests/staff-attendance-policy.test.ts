import { describe, expect, it } from 'vitest'
import {
  EMPTY_STAFF_COUNTS,
  STAFF_ATTENDANCE_STATUSES,
  STAFF_ATTENDANCE_STATUS_LABEL,
  checkStaffAttendanceDate,
  countStaffStatuses,
  staffAttendancePercentage,
  wasEmployedOn,
} from '@/server/staff-attendance/staff-attendance-policy'

/**
 * Phase 22. The rule that matters most: approved leave comes out of the
 * reckoning rather than being counted against the person, and an unmarked day
 * is not an absence.
 */
describe('counting a month', () => {
  it('counts each status and how many days were marked at all', () => {
    const counts = countStaffStatuses(['PRESENT', 'PRESENT', 'ABSENT', 'SHORT_LEAVE', 'LEAVE'])
    expect(counts).toEqual({ present: 2, absent: 1, shortLeave: 1, leave: 1, marked: 5 })
    expect(countStaffStatuses([])).toEqual(EMPTY_STAFF_COUNTS)
  })

  it('counts short leave as a day at work, and leaves approved leave out entirely', () => {
    // 2 present + 1 short leave worked, 1 absent → 3 of 4.
    expect(staffAttendancePercentage(countStaffStatuses(['PRESENT', 'PRESENT', 'SHORT_LEAVE', 'ABSENT']))).toBe(75)
    // The same, with ten days of leave added: the answer must not move.
    expect(staffAttendancePercentage(countStaffStatuses(['PRESENT', 'PRESENT', 'SHORT_LEAVE', 'ABSENT', ...Array(10).fill('LEAVE' as const)]))).toBe(75)
  })

  it('is null when nothing has been marked, and when only leave has been', () => {
    expect(staffAttendancePercentage(EMPTY_STAFF_COUNTS)).toBeNull()
    expect(staffAttendancePercentage(countStaffStatuses(['LEAVE', 'LEAVE']))).toBeNull()
  })

  it('reaches 100 and 0 exactly, and rounds to one decimal', () => {
    expect(staffAttendancePercentage(countStaffStatuses(['PRESENT', 'SHORT_LEAVE']))).toBe(100)
    expect(staffAttendancePercentage(countStaffStatuses(['ABSENT', 'ABSENT']))).toBe(0)
    expect(staffAttendancePercentage(countStaffStatuses(['PRESENT', 'PRESENT', 'ABSENT']))).toBe(66.7)
  })

  it('names every status in words', () => {
    for (const status of STAFF_ATTENDANCE_STATUSES) expect(STAFF_ATTENDANCE_STATUS_LABEL[status]).toBeTruthy()
    expect(STAFF_ATTENDANCE_STATUS_LABEL.SHORT_LEAVE).toBe('Short leave')
  })
})

describe('which day may be marked', () => {
  it('allows today and any past day, and refuses the future', () => {
    expect(checkStaffAttendanceDate('2026-09-08', '2026-09-08').allowed).toBe(true)
    expect(checkStaffAttendanceDate('2026-08-01', '2026-09-08').allowed).toBe(true)
    const refused = checkStaffAttendanceDate('2026-09-09', '2026-09-08')
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.reason).toMatch(/future/)
  })
})

describe('who appears on a day’s register', () => {
  const day = '2026-09-08'
  it('includes anyone employed on that day, whatever their status is now', () => {
    expect(wasEmployedOn({ joiningDate: '2020-01-01', leavingDate: null }, day)).toBe(true)
    expect(wasEmployedOn({ joiningDate: '2026-09-08', leavingDate: null }, day)).toBe(true)
    expect(wasEmployedOn({ joiningDate: '2020-01-01', leavingDate: '2026-09-08' }, day)).toBe(true)
    // Left in October; January's register still has their name.
    expect(wasEmployedOn({ joiningDate: '2020-01-01', leavingDate: '2026-10-31' }, day)).toBe(true)
  })

  it('excludes anyone who had not joined yet, or had already left', () => {
    expect(wasEmployedOn({ joiningDate: '2026-09-09', leavingDate: null }, day)).toBe(false)
    expect(wasEmployedOn({ joiningDate: '2020-01-01', leavingDate: '2026-09-07' }, day)).toBe(false)
  })
})

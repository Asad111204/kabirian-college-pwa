import { describe, expect, it } from 'vitest'
import {
  myStaffAttendanceQuerySchema,
  staffAttendanceDayQuerySchema,
  staffAttendanceMonthQuerySchema,
  staffAttendanceSaveSchema,
} from '@/validation/staff-attendance'

/**
 * Phase 22. What the staff-attendance endpoints will and will not accept.
 * Anything the browser sends is checked here before a service sees it.
 */
const STAFF = '88888888-8888-4888-8888-888888888881'
const OTHER = '88888888-8888-4888-8888-888888888882'

describe('saving a day’s register', () => {
  it('accepts a date and a list of marks', () => {
    const parsed = staffAttendanceSaveSchema.parse({
      date: '2026-09-08',
      entries: [
        { staffId: STAFF, status: 'PRESENT' },
        { staffId: OTHER, status: 'SHORT_LEAVE', remarks: 'Left after third period' },
      ],
    })
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[1]!.remarks).toBe('Left after third period')
  })

  it('refuses a status the college does not use', () => {
    const bad = staffAttendanceSaveSchema.safeParse({ date: '2026-09-08', entries: [{ staffId: STAFF, status: 'HALF_DAY' }] })
    expect(bad.success).toBe(false)
  })

  it('refuses an empty register, a bad date and an id that is not a uuid', () => {
    expect(staffAttendanceSaveSchema.safeParse({ date: '2026-09-08', entries: [] }).success).toBe(false)
    expect(staffAttendanceSaveSchema.safeParse({ date: '08-09-2026', entries: [{ staffId: STAFF, status: 'PRESENT' }] }).success).toBe(false)
    expect(staffAttendanceSaveSchema.safeParse({ date: '2026-09-08', entries: [{ staffId: 'staff-1', status: 'PRESENT' }] }).success).toBe(false)
  })

  it('refuses a remark longer than the column, and more people than the college has', () => {
    expect(staffAttendanceSaveSchema.safeParse({ date: '2026-09-08', entries: [{ staffId: STAFF, status: 'LEAVE', remarks: 'x'.repeat(256) }] }).success).toBe(false)
    const many = Array.from({ length: 501 }, () => ({ staffId: STAFF, status: 'PRESENT' as const }))
    expect(staffAttendanceSaveSchema.safeParse({ date: '2026-09-08', entries: many }).success).toBe(false)
  })
})

describe('asking for a day or a month', () => {
  it('defaults to the whole staff and leaves the date to the server', () => {
    const day = staffAttendanceDayQuerySchema.parse({})
    expect(day.staffType).toBe('ALL')
    expect(day.date).toBeUndefined()
    expect(staffAttendanceMonthQuerySchema.parse({}).staffType).toBe('ALL')
  })

  it('treats an empty department box as no filter at all', () => {
    expect(staffAttendanceDayQuerySchema.parse({ departmentId: '' }).departmentId).toBeUndefined()
    expect(staffAttendanceMonthQuerySchema.parse({ departmentId: '' }).departmentId).toBeUndefined()
  })

  it('refuses a department that is not a uuid, and a staff type it does not know', () => {
    expect(staffAttendanceDayQuerySchema.safeParse({ departmentId: 'science' }).success).toBe(false)
    expect(staffAttendanceDayQuerySchema.safeParse({ staffType: 'VISITING' }).success).toBe(false)
  })

  it('lets a staff member ask for one month of their own record', () => {
    expect(myStaffAttendanceQuerySchema.parse({ month: '2026-08-01' }).month).toBe('2026-08-01')
    expect(myStaffAttendanceQuerySchema.parse({}).month).toBeUndefined()
    expect(myStaffAttendanceQuerySchema.safeParse({ month: 'August' }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { ATTENDANCE_CORRECTION_DAYS_DEFAULT, ATTENDANCE_CORRECTION_DAYS_MAX, attendanceRulesSchema } from '@/validation/settings'

/** The office's attendance rules, as the Settings form sends them. */
describe('attendanceRulesSchema', () => {
  it('reads the number of days from a form field and the checkbox as a boolean', () => {
    const parsed = attendanceRulesSchema.parse({ teacherCorrectionDays: '14', leaveCountsAsPresent: true })
    expect(parsed.teacherCorrectionDays).toBe(14)
    expect(parsed.leaveCountsAsPresent).toBe(true)
  })

  it('allows zero (office only) and the ceiling, and refuses beyond, negatives and fractions', () => {
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: 0, leaveCountsAsPresent: false }).success).toBe(true)
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: ATTENDANCE_CORRECTION_DAYS_MAX, leaveCountsAsPresent: false }).success).toBe(true)
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: ATTENDANCE_CORRECTION_DAYS_MAX + 1, leaveCountsAsPresent: false }).success).toBe(false)
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: -1, leaveCountsAsPresent: false }).success).toBe(false)
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: 2.5, leaveCountsAsPresent: false }).success).toBe(false)
    expect(attendanceRulesSchema.safeParse({ teacherCorrectionDays: 3, leaveCountsAsPresent: 'yes' }).success).toBe(false)
  })

  it('defaults to a week', () => {
    expect(ATTENDANCE_CORRECTION_DAYS_DEFAULT).toBe(7)
  })
})

import { z } from 'zod'

/**
 * The college's attendance rules, set by the office under Settings.
 *
 *   - `teacherCorrectionDays`: for how many days after submitting a register a
 *     teacher may still correct it themselves. 0 means never — only the office.
 *   - `leaveCountsAsPresent`: whether LEAVE counts towards the percentage.
 */
export const ATTENDANCE_CORRECTION_DAYS_DEFAULT = 7
export const ATTENDANCE_CORRECTION_DAYS_MAX = 60

export const attendanceRulesSchema = z.object({
  teacherCorrectionDays: z.coerce
    .number()
    .int('Use a whole number of days.')
    .min(0, 'Use 0 for "only the office", or a number of days.')
    .max(ATTENDANCE_CORRECTION_DAYS_MAX, `Use at most ${ATTENDANCE_CORRECTION_DAYS_MAX} days.`),
  leaveCountsAsPresent: z.boolean(),
})

export type AttendanceRulesInput = z.infer<typeof attendanceRulesSchema>

export const SETTING_TEACHER_CORRECTION_DAYS = 'attendance.teacher_correction_days'
export const SETTING_LEAVE_COUNTS_AS_PRESENT = 'attendance.leave_counts_as_present'

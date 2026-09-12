import { z } from 'zod'
import { isoDate, optionalText, uuid } from './common'
import { STAFF_ATTENDANCE_STATUSES } from '@/server/staff-attendance/staff-attendance-policy'

/** Staff attendance: the office marks a day (Phase 22). */
export const staffAttendanceStatusSchema = z.enum(STAFF_ATTENDANCE_STATUSES, {
  error: 'Choose Present, Absent, Short leave or Leave.',
})

/** One day's register: the marks the office is setting. */
export const staffAttendanceSaveSchema = z.object({
  date: isoDate,
  entries: z
    .array(
      z.object({
        staffId: uuid,
        status: staffAttendanceStatusSchema,
        remarks: optionalText(255),
      }),
    )
    .min(1, 'Send at least one staff member.')
    .max(500, 'That is more staff than the school has.'),
})

export const staffAttendanceDayQuerySchema = z.object({
  date: isoDate.optional(),
  departmentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  staffType: z.union([z.enum(['TEACHING', 'NON_TEACHING']), z.literal('ALL')]).default('ALL'),
})

/** The month view: one row per staff member, counted. */
export const staffAttendanceMonthQuerySchema = z.object({
  /** Any day in the month being asked about; the service takes its month. */
  month: isoDate.optional(),
  departmentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  staffType: z.union([z.enum(['TEACHING', 'NON_TEACHING']), z.literal('ALL')]).default('ALL'),
})

/** A staff member's own record. */
export const myStaffAttendanceQuerySchema = z.object({
  month: isoDate.optional(),
})

export type StaffAttendanceSaveInput = z.infer<typeof staffAttendanceSaveSchema>
export type StaffAttendanceDayQuery = z.infer<typeof staffAttendanceDayQuerySchema>
export type StaffAttendanceMonthQuery = z.infer<typeof staffAttendanceMonthQuerySchema>
export type MyStaffAttendanceQuery = z.infer<typeof myStaffAttendanceQuerySchema>

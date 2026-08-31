/**
 * Attendance validation, shared by the browser and the server.
 *
 * As everywhere else in this project, the browser copy is a convenience and the
 * server copy is the security boundary. Nothing here decides *authorisation* —
 * these schemas only check that a request is well formed. Whether the person may
 * do it is settled in the service against the database.
 */
import { z } from 'zod'
import { isoDate, optionalText, uuid } from './common'
import { PERIOD_MAX, PERIOD_MIN } from '@/server/attendance/attendance-policy'

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const
export const SHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'CANCELLED'] as const

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES, {
  error: 'Choose Present, Absent, Late or Leave.',
})

/** Labels for the UI, so every screen names a status the same way. */
export const ATTENDANCE_STATUS_LABEL: Record<(typeof ATTENDANCE_STATUSES)[number], string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  LEAVE: 'Leave',
}

export const SHEET_STATUS_LABEL: Record<(typeof SHEET_STATUSES)[number], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  CANCELLED: 'Cancelled',
}

const period = z.coerce
  .number({ error: 'Period must be a number.' })
  .int('Period must be a whole number.')
  .min(PERIOD_MIN, `Period must be ${PERIOD_MIN} or more.`)
  .max(PERIOD_MAX, `Period must be ${PERIOD_MAX} or less.`)

/**
 * Creating a register.
 *
 * `academicSessionId` is deliberately absent: it is derived from the section on
 * the server. Accepting it from the browser would invite a request that pairs a
 * section with someone else's session, and the server would then have to decide
 * which of the two to believe.
 */
export const attendanceSheetCreateSchema = z.object({
  sectionId: uuid,
  /** Omit or send null for daily roll-call. */
  subjectId: uuid.nullish(),
  date: isoDate,
  period: period.default(1),
  /**
   * Which teacher took this register. **Administrators only** — the office
   * entering a paper register records the teacher who actually took it, rather
   * than putting the clerk's name on somebody else's class. Ignored when a
   * teacher marks their own, which is always attributed to them.
   */
  markedByStaffId: uuid.optional(),
  /**
   * Optional. A teacher who marks as they go can send the statuses with the
   * register; anyone who omits them gets a draft defaulted to PRESENT, which
   * counts towards nothing until it is submitted.
   */
  entries: z
    .array(
      z.object({
        studentId: uuid,
        status: attendanceStatusSchema,
        remarks: optionalText(255),
      }),
    )
    .max(500, 'That is more students than a section can hold.')
    .optional(),
})

export type AttendanceSheetCreateInput = z.infer<typeof attendanceSheetCreateSchema>

/** Marking several students at once — what a teacher's screen will send. */
export const attendanceSheetMarkSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: uuid,
        status: attendanceStatusSchema,
        remarks: optionalText(255),
      }),
    )
    .min(1, 'Send at least one student.')
    .max(500, 'That is more students than a section can hold.'),
})

/** Changing one student's mark. */
export const attendanceEntryUpdateSchema = z
  .object({
    status: attendanceStatusSchema.optional(),
    remarks: optionalText(255),
  })
  .refine((v) => v.status !== undefined || v.remarks !== undefined, {
    message: 'Nothing to change.',
  })

export const attendanceCancelSchema = z.object({
  /**
   * Required, and not blank. "Cancelled" with no reason removes a class from
   * every student's percentage with nothing on record explaining why.
   */
  cancelledReason: z
    .string({ error: 'Give a reason for cancelling.' })
    .trim()
    .min(3, 'Give a reason for cancelling.')
    .max(255, 'Use at most 255 characters.'),
})

/** Filters for the sheet list. Every one of them is applied on the server. */
export const attendanceSheetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  academicSessionId: uuid.optional(),
  sectionId: uuid.optional(),
  subjectId: uuid.optional(),
  staffId: uuid.optional(),
  status: z.enum(SHEET_STATUSES).optional(),
  date: isoDate.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  /** Daily roll-call only, or subject lessons only. */
  kind: z.enum(['daily', 'subject']).optional(),
})

export type AttendanceSheetListQuery = z.infer<typeof attendanceSheetListQuerySchema>

/**
 * A student asking for their own attendance.
 *
 * Note what is **not** here: any way to name a student. The record returned is
 * always the signed-in student's, so `?studentId=` is simply not read.
 */
export const myAttendanceQuerySchema = z.object({
  academicSessionId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  /** A subject id, or 'DAILY' to see roll-call on its own. */
  subject: z.union([uuid, z.literal('DAILY')]).optional(),
  status: attendanceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Report filters.
 *
 * Notably absent: any way to name a staff member for scoping. A teacher's scope
 * comes from their own assignments, read on the server — narrowing by section or
 * subject can only ever shrink it.
 */
export const attendanceReportFilterSchema = z.object({
  academicSessionId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  classId: uuid.optional(),
  divisionId: uuid.optional(),
  programId: uuid.optional(),
  sectionId: uuid.optional(),
  subjectId: uuid.optional(),
  kind: z.enum(['all', 'daily', 'subject']).default('all'),
})

export type AttendanceReportFilters = z.infer<typeof attendanceReportFilterSchema>

/** Sorting is a whitelist; a column name never comes from the request. */
export const STUDENT_REPORT_SORTS = ['percentage_asc', 'percentage_desc', 'name', 'code'] as const

export const studentReportQuerySchema = attendanceReportFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(STUDENT_REPORT_SORTS).default('percentage_asc'),
})

export const registerReportQuerySchema = attendanceReportFilterSchema.extend({
  /** Which teacher took the register. Admin filtering only; never a scope. */
  staffId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

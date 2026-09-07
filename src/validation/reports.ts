/**
 * Report filters, shared by the browser and the server.
 *
 * Every academic filter is an id -- class, division, programme, group,
 * section -- so a programme added this morning is reportable this afternoon
 * with no code change. `groupBy` names a level of the same structure, and
 * `format` decides whether the same rows come back as JSON for the screen or
 * as a CSV file: one query, two renderings, so the export always matches the
 * page (requirement: "exports match on-screen data").
 */
import { z } from 'zod'
import { isoDate, uuid } from './common'
import { EMPLOYMENT_STATUSES, STAFF_TYPES } from './staff'
import { STUDENT_STATUSES } from './students'
import { RESULT_OUTCOMES, RESULT_STATUSES } from './results'

const optionalOf = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .transform((value) => (value === '' ? undefined : (value as z.infer<T>)))
    .optional()

export const REPORT_GROUPINGS = ['none', 'class', 'division', 'program', 'group', 'section'] as const
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number]

export const REPORT_GROUPING_LABEL: Record<ReportGrouping, string> = {
  none: 'No grouping',
  class: 'By class',
  division: 'By division',
  program: 'By programme',
  group: 'By group (class × division × programme)',
  section: 'By section',
}

export const REPORT_FORMATS = ['json', 'csv'] as const

/** Where in the structure a report looks. */
const scopeFields = {
  academicSessionId: optionalOf(uuid),
  classId: optionalOf(uuid),
  divisionId: optionalOf(uuid),
  programId: optionalOf(uuid),
  academicGroupId: optionalOf(uuid),
  sectionId: optionalOf(uuid),
  groupBy: z.enum(REPORT_GROUPINGS).default('none'),
  format: z.enum(REPORT_FORMATS).default('json'),
}

export const studentReportQuerySchema = z.object({
  ...scopeFields,
  status: z.union([z.enum(STUDENT_STATUSES), z.literal('ALL')]).default('ACTIVE'),
})
export type StudentReportQuery = z.infer<typeof studentReportQuerySchema>

export const staffReportQuerySchema = z.object({
  departmentId: optionalOf(uuid),
  designationId: optionalOf(uuid),
  staffType: z.union([z.enum(STAFF_TYPES), z.literal('ALL')]).default('ALL'),
  status: z.union([z.enum(EMPLOYMENT_STATUSES), z.literal('ALL')]).default('ACTIVE'),
  groupBy: z.enum(['none', 'department', 'designation', 'type']).default('none'),
  format: z.enum(REPORT_FORMATS).default('json'),
})
export type StaffReportQuery = z.infer<typeof staffReportQuerySchema>

export const missingDocumentsQuerySchema = z.object({
  ...scopeFields,
  /** One document type, or every required one. */
  documentTypeKey: z.string().trim().max(50).optional().transform((v) => (v ? v : undefined)),
})
export type MissingDocumentsQuery = z.infer<typeof missingDocumentsQuerySchema>

export const examReportQuerySchema = z.object({
  examId: uuid,
  format: z.enum(REPORT_FORMATS).default('json'),
})
export type ExamReportQuery = z.infer<typeof examReportQuerySchema>

export const resultReportQuerySchema = z.object({
  examId: uuid,
  classId: optionalOf(uuid),
  programId: optionalOf(uuid),
  sectionId: optionalOf(uuid),
  outcome: optionalOf(z.enum(RESULT_OUTCOMES)),
  status: optionalOf(z.enum(RESULT_STATUSES)),
  groupBy: z.enum(['none', 'class', 'program', 'section']).default('none'),
  format: z.enum(REPORT_FORMATS).default('json'),
})
export type ResultReportQuery = z.infer<typeof resultReportQuerySchema>

export const attendanceReportExportSchema = z.object({
  academicSessionId: optionalOf(uuid),
  dateFrom: optionalOf(isoDate),
  dateTo: optionalOf(isoDate),
  classId: optionalOf(uuid),
  divisionId: optionalOf(uuid),
  programId: optionalOf(uuid),
  sectionId: optionalOf(uuid),
  subjectId: optionalOf(uuid),
  kind: z.enum(['all', 'daily', 'subject']).default('all'),
  format: z.enum(REPORT_FORMATS).default('json'),
})
export type AttendanceReportExportQuery = z.infer<typeof attendanceReportExportSchema>

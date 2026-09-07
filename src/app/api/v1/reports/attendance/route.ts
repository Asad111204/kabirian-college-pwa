import { reportRoute } from '@/server/api/report-response'
import { getAttendanceReportExport } from '@/server/services/reports.service'
import type { StudentReportRow } from '@/server/services/attendance-report.service'
import { attendanceReportExportSchema } from '@/validation/reports'

/**
 * GET /api/v1/reports/attendance?…&format=json|csv -- the overview and every
 * student in scope. The same query the attendance reports screen runs; only
 * submitted registers count.
 */
export const GET = reportRoute({
  schema: attendanceReportExportSchema,
  load: getAttendanceReportExport,
  rows: (out) => out.students,
  columns: () => [
    { header: 'Student code', value: (r: StudentReportRow) => r.studentCode },
    { header: 'Name', value: (r: StudentReportRow) => r.fullName },
    { header: 'Present', value: (r: StudentReportRow) => r.present },
    { header: 'Late', value: (r: StudentReportRow) => r.late },
    { header: 'Absent', value: (r: StudentReportRow) => r.absent },
    { header: 'Leave', value: (r: StudentReportRow) => r.leave },
    { header: 'Total', value: (r: StudentReportRow) => r.total },
    { header: 'Attended', value: (r: StudentReportRow) => r.attended },
    { header: 'Attendance %', value: (r: StudentReportRow) => r.percentage },
  ],
  fileName: (_out, query) => ['attendance', query.dateFrom, query.dateTo],
})

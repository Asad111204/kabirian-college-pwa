import { reportRoute } from '@/server/api/report-response'
import { getStudentReport, type StudentReportRowOut } from '@/server/services/reports.service'
import { studentReportQuerySchema } from '@/validation/reports'

/** GET /api/v1/reports/students?…&format=json|csv -- every student in scope, grouped. */
export const GET = reportRoute({
  schema: studentReportQuerySchema,
  load: getStudentReport,
  rows: (out) => out.groups.flatMap((g) => g.rows.map((row) => ({ group: g.label, ...row }))),
  columns: (_out, query) => [
    ...(query.groupBy !== 'none' ? [{ header: 'Group', value: (r: StudentReportRowOut & { group: string }) => r.group }] : []),
    { header: 'Student code', value: (r: StudentReportRowOut) => r.studentCode },
    { header: 'Admission no.', value: (r: StudentReportRowOut) => r.admissionNumber },
    { header: 'Name', value: (r: StudentReportRowOut) => r.fullName },
    { header: "Father's name", value: (r: StudentReportRowOut) => r.fatherName },
    { header: 'Class', value: (r: StudentReportRowOut) => r.className },
    { header: 'Division', value: (r: StudentReportRowOut) => r.divisionName },
    { header: 'Programme', value: (r: StudentReportRowOut) => r.programName },
    { header: 'Section', value: (r: StudentReportRowOut) => r.sectionName },
    { header: 'Roll no.', value: (r: StudentReportRowOut) => r.rollNumber },
    { header: 'Status', value: (r: StudentReportRowOut) => r.status },
    { header: 'Admitted', value: (r: StudentReportRowOut) => r.admissionDate },
    { header: 'Has login', value: (r: StudentReportRowOut) => r.hasAccount },
  ],
  fileName: (out) => ['students', out.scope.sessionName, out.scope.className, out.scope.divisionName, out.scope.programName, out.scope.sectionName && `section ${out.scope.sectionName}`],
})

import { reportRoute } from '@/server/api/report-response'
import { getStaffReport, type StaffReportRow } from '@/server/services/reports.service'
import { staffReportQuerySchema } from '@/validation/reports'

/** GET /api/v1/reports/staff?…&format=json|csv -- every staff member in scope, grouped. */
export const GET = reportRoute({
  schema: staffReportQuerySchema,
  load: getStaffReport,
  rows: (out) => out.groups.flatMap((g) => g.rows.map((row) => ({ group: g.label, ...row }))),
  columns: (_out, query) => [
    ...(query.groupBy !== 'none' ? [{ header: 'Group', value: (r: StaffReportRow & { group: string }) => r.group }] : []),
    { header: 'Staff code', value: (r: StaffReportRow) => r.staffCode },
    { header: 'Name', value: (r: StaffReportRow) => r.fullName },
    { header: 'Designation', value: (r: StaffReportRow) => r.designation },
    { header: 'Department', value: (r: StaffReportRow) => r.department },
    { header: 'Type', value: (r: StaffReportRow) => r.staffType },
    { header: 'Status', value: (r: StaffReportRow) => r.employmentStatus },
    { header: 'Phone', value: (r: StaffReportRow) => r.phone },
    { header: 'Joined', value: (r: StaffReportRow) => r.joiningDate },
    { header: 'Active assignments', value: (r: StaffReportRow) => r.activeAssignments },
    { header: 'Has login', value: (r: StaffReportRow) => r.hasAccount },
  ],
  fileName: (_out, query) => ['staff', query.status !== 'ALL' ? query.status : null, query.staffType !== 'ALL' ? query.staffType : null],
})

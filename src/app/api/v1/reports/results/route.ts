import { reportRoute } from '@/server/api/report-response'
import { getResultReport } from '@/server/services/reports.service'
import type { ResultRow } from '@/server/services/results.service'
import { resultReportQuerySchema } from '@/validation/reports'

/** GET /api/v1/reports/results?examId=…&format=json|csv -- every result in scope, grouped. */
export const GET = reportRoute({
  schema: resultReportQuerySchema,
  load: getResultReport,
  rows: (out) => out.groups.flatMap((g) => g.rows.map((row) => ({ group: g.label, ...row }))),
  columns: (_out, query) => [
    ...(query.groupBy !== 'none' ? [{ header: 'Group', value: (r: ResultRow & { group: string }) => r.group }] : []),
    { header: 'Student code', value: (r: ResultRow) => r.studentCode },
    { header: 'Name', value: (r: ResultRow) => r.studentName },
    { header: 'Roll no.', value: (r: ResultRow) => r.rollNumber },
    { header: 'Class', value: (r: ResultRow) => r.className },
    { header: 'Division', value: (r: ResultRow) => r.divisionName },
    { header: 'Programme', value: (r: ResultRow) => r.programName },
    { header: 'Section', value: (r: ResultRow) => r.sectionName },
    { header: 'Total marks', value: (r: ResultRow) => r.totalMaxMarks },
    { header: 'Obtained', value: (r: ResultRow) => r.totalObtainedMarks },
    { header: 'Percentage', value: (r: ResultRow) => r.percentage },
    { header: 'Grade', value: (r: ResultRow) => r.grade },
    { header: 'Result', value: (r: ResultRow) => r.outcome },
    { header: 'Position', value: (r: ResultRow) => r.position },
    { header: 'Status', value: (r: ResultRow) => r.status },
  ],
  fileName: (out, query) => ['results', out.exam.name, query.outcome, query.status],
})

import { reportRoute } from '@/server/api/report-response'
import { getExamReport } from '@/server/services/reports.service'
import type { MarkSheetStatusRow } from '@/server/services/marks.service'
import { examReportQuerySchema } from '@/validation/reports'

/** GET /api/v1/reports/exams?examId=…&format=json|csv -- which papers are marked, by section. */
export const GET = reportRoute({
  schema: examReportQuerySchema,
  load: getExamReport,
  rows: (out) => out.papers,
  columns: () => [
    { header: 'Subject', value: (r: MarkSheetStatusRow) => r.subjectName },
    { header: 'Class', value: (r: MarkSheetStatusRow) => r.className },
    { header: 'Programme', value: (r: MarkSheetStatusRow) => r.programName ?? 'Whole class' },
    { header: 'Division', value: (r: MarkSheetStatusRow) => r.divisionName },
    { header: 'Section', value: (r: MarkSheetStatusRow) => r.sectionName },
    { header: 'Teacher', value: (r: MarkSheetStatusRow) => r.teacherName },
    { header: 'Mark sheet', value: (r: MarkSheetStatusRow) => r.status ?? 'Not opened' },
    { header: 'Students', value: (r: MarkSheetStatusRow) => r.counts.total },
    { header: 'Entered', value: (r: MarkSheetStatusRow) => r.counts.entered },
    { header: 'Absent', value: (r: MarkSheetStatusRow) => r.counts.absent },
    { header: 'Pending', value: (r: MarkSheetStatusRow) => r.counts.pending },
    { header: 'Submitted at', value: (r: MarkSheetStatusRow) => r.submittedAt },
  ],
  fileName: (out) => ['exam', out.exam.name, 'mark sheets'],
})

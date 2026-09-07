import { reportRoute } from '@/server/api/report-response'
import { getMissingDocumentsReport, type MissingDocumentRow } from '@/server/services/reports.service'
import { missingDocumentsQuerySchema } from '@/validation/reports'

/** GET /api/v1/reports/missing-documents?…&format=json|csv -- students without a required document. */
export const GET = reportRoute({
  schema: missingDocumentsQuerySchema,
  load: getMissingDocumentsReport,
  rows: (out) => out.groups.flatMap((g) => g.rows.map((row) => ({ group: g.label, ...row }))),
  columns: (_out, query) => [
    ...(query.groupBy !== 'none' ? [{ header: 'Group', value: (r: MissingDocumentRow & { group: string }) => r.group }] : []),
    { header: 'Student code', value: (r: MissingDocumentRow) => r.studentCode },
    { header: 'Name', value: (r: MissingDocumentRow) => r.fullName },
    { header: 'Class', value: (r: MissingDocumentRow) => r.className },
    { header: 'Division', value: (r: MissingDocumentRow) => r.divisionName },
    { header: 'Programme', value: (r: MissingDocumentRow) => r.programName },
    { header: 'Section', value: (r: MissingDocumentRow) => r.sectionName },
    { header: 'Missing', value: (r: MissingDocumentRow) => r.missing.join('; ') },
  ],
  fileName: (out) => ['missing documents', out.scope.sessionName, out.scope.className, out.scope.programName, out.scope.sectionName && `section ${out.scope.sectionName}`],
})

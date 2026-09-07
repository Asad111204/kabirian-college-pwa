import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { env } from '@/server/config/env'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { getEnrollmentOptions } from '@/server/services/students.service'
import { listDepartments, listDesignations } from '@/server/services/reference-data.service'
import { listExams } from '@/server/services/exams.service'
import { examListQuerySchema } from '@/validation/exams'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { ReportCentre } from '@/features/reports/report-centre'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Reports.
 *
 * The server authenticates, authorises and gathers the option lists -- every
 * one read from the database, so a programme added this morning is
 * reportable this afternoon. The client component asks the report API for the
 * rows and links to the same query as a CSV. Nothing here is computed twice.
 */
export default async function ReportsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])

  if (!can(ctx, 'reports.generate')) {
    return (
      <>
        <PageHeader title="Reports" />
        <Alert variant="warning" title="Reports are not available to this account">
          Generating reports needs the “generate and export reports” permission. An administrator can
          grant it in <Link href="/admin/users">User Accounts</Link>.
        </Alert>
      </>
    )
  }

  const sessions = await listAcademicSessions(ctx)
  const currentSessionId = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? null

  const [groups, departments, designations, exams] = await Promise.all([
    currentSessionId ? getEnrollmentOptions(ctx, currentSessionId) : Promise.resolve([]),
    listDepartments(ctx),
    listDesignations(ctx),
    listExams(ctx, examListQuerySchema.parse({ pageSize: 100 })),
  ])

  return (
    <>
      <PageHeader
        title="Reports"
        description="Students, staff, missing documents, exam mark sheets and results — filtered by class, division, programme or section, printed or downloaded as CSV. Attendance reports have their own page."
        actions={
          <Link href="/admin/attendance/reports" className="text-sm text-primary hover:underline">
            Attendance reports →
          </Link>
        }
      />
      <ReportCentre
        options={{
          sessions: sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent })),
          groups,
          departments: departments.map((d) => ({ id: d.id, name: d.name })),
          designations: designations.map((d) => ({ id: d.id, name: d.name })),
          exams: exams.items.map((x) => ({ id: x.id, name: x.name, sessionName: x.sessionName, status: x.status })),
          collegeName: env.APP_COLLEGE_NAME,
        }}
      />
    </>
  )
}

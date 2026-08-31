import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import { getAttendanceOverview } from '@/server/services/attendance-report.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { getEnrollmentOptions } from '@/server/services/students.service'
import { listSubjects } from '@/server/services/academic-blocks.service'
import { listStaff } from '@/server/services/staff.service'
import { staffListQuerySchema } from '@/validation/staff'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { AdminAttendanceReport } from '@/features/attendance/admin-attendance-report'

export const metadata: Metadata = { title: 'Attendance reports' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Attendance → Reports.
 *
 * The server authenticates, authorises and fetches the first view; the client
 * component handles filters and paging. Only plain data crosses the boundary.
 */
export default async function AttendanceReportsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const sessions = await listAcademicSessions(ctx)

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader title="Attendance reports" />
        <Alert variant="warning" title="No academic session yet">
          Create an academic session and its structure before running reports.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  const currentSessionId = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? ''

  const [overview, groups, subjectPage, staffPage] = await Promise.all([
    getAttendanceOverview(ctx, { academicSessionId: currentSessionId }),
    getEnrollmentOptions(ctx, currentSessionId),
    listSubjects(ctx, { pageSize: 100 }),
    listStaff(ctx, staffListQuerySchema.parse({ pageSize: 100 })),
  ])

  return (
    <>
      <PageHeader
        title="Attendance reports"
        description="Only submitted registers are counted. Late counts as present."
      />

      <div className="mb-4">
        <Button variant="secondary" size="sm" asChild>
          <Link href="/admin/attendance">Back to registers</Link>
        </Button>
      </div>

      <AdminAttendanceReport
        initialOverview={overview}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        groups={groups}
        subjects={subjectPage.items.map((s) => ({ id: s.id, name: s.name }))}
        staff={staffPage.items.map((s) => ({ id: s.id, fullName: s.fullName }))}
        today={todayInCollegeTimezone()}
      />
    </>
  )
}

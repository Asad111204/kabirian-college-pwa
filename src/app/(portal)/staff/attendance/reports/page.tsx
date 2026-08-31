import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import { getTeacherReportScopes } from '@/server/services/attendance-report.service'
import { ForbiddenError } from '@/server/api/errors'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { TeacherAttendanceReport } from '@/features/attendance/teacher-attendance-report'

export const metadata: Metadata = { title: 'My attendance reports' }
export const dynamic = 'force-dynamic'

/**
 * Staff Portal → Attendance → Reports.
 *
 * The scopes offered are built on the server from this teacher's own assignments
 * and in-charge records. Even so, the reporting queries apply the same scope
 * clause again, so a hand-crafted request for another teacher's section returns
 * nothing rather than their figures.
 */
export default async function StaffAttendanceReportsPage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let scopes
  try {
    scopes = await getTeacherReportScopes(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My attendance reports" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your reports
            appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader
        title="My attendance reports"
        description="Only submitted registers are counted. Late counts as present."
      />

      <div className="mb-4">
        <Button variant="secondary" size="sm" asChild>
          <Link href="/staff/attendance">Back to today&rsquo;s attendance</Link>
        </Button>
      </div>

      <TeacherAttendanceReport
        scopes={scopes.map((s) => ({
          kind: s.kind,
          sectionId: s.sectionId,
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          className: s.className,
          divisionName: s.divisionName,
          programName: s.programName,
          sectionName: s.sectionName,
        }))}
        today={todayInCollegeTimezone()}
      />
    </>
  )
}

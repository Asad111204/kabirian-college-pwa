import type { Metadata } from 'next'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getMyMarkingOptions } from '@/server/services/attendance.service'
import { ForbiddenError } from '@/server/api/errors'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { TeacherAttendanceOptions } from '@/features/attendance/teacher-attendance-options'

export const metadata: Metadata = { title: 'Attendance' }
export const dynamic = 'force-dynamic'

/**
 * Staff Portal → Attendance.
 *
 * The list of what this teacher may mark is built on the server from their own
 * active assignments and in-charge records. Nothing is chosen by the browser, so
 * there is no section or subject id for anyone to substitute.
 *
 * "Today" is the college's own date (Asia/Karachi), decided on the server — not
 * whatever the phone's clock says.
 */
export default async function StaffAttendancePage() {
  const ctx = await requirePortalAccess(['STAFF'])
  const today = todayInCollegeTimezone()

  let options
  try {
    options = await getMyMarkingOptions(ctx, today)
  } catch (error) {
    // A staff login that is not linked to a staff record has no assignments at
    // all, and no way to acquire any without the office. Same handling as the
    // staff dashboard, rather than a 500.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Today's attendance" description={formatDate(today)} />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your classes
            appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader title="Today's attendance" description={formatDate(today)} />

      <TeacherAttendanceOptions
        options={options.map((option) => ({
          kind: option.kind,
          sectionId: option.sectionId,
          subjectId: option.subjectId,
          subjectName: option.subjectName,
          sessionName: option.sessionName,
          className: option.className,
          divisionName: option.divisionName,
          programName: option.programName,
          sectionName: option.sectionName,
          studentCount: option.studentCount,
          todaySheets: option.todaySheets,
        }))}
        today={today}
        todayLabel={formatDate(today)}
        canCreate={can(ctx, 'attendance.create')}
      />

      <Alert variant="info" className="mt-4">
        Attendance counts only once you submit it. A draft is yours to finish; after you submit,
        changes go through the office.
      </Alert>
    </>
  )
}

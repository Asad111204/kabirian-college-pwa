import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyAttendance } from '@/server/services/attendance.service'
import { ForbiddenError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { StudentAttendanceView } from '@/features/attendance/student-attendance-view'

export const metadata: Metadata = { title: 'My attendance' }
export const dynamic = 'force-dynamic'

/**
 * Student Portal → My attendance. Read-only.
 *
 * The student is resolved from the signed-in session inside the service, which
 * takes no student id at all — so there is no parameter on this page, in the
 * API, or in the service that could be pointed at somebody else's record.
 *
 * Every figure shown is calculated by the server using the college's own rule.
 */
export default async function StudentAttendancePage() {
  const ctx = await requirePortalAccess(['STUDENT'])

  let data
  try {
    data = await getMyAttendance(ctx)
  } catch (error) {
    // A student login that is not linked to a student record has nothing to show
    // — and must not be shown anybody else's.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My attendance" />
          <Alert variant="warning" title="Your account is not linked to a student record yet">
            The college office needs to connect this login to your student record before your
            attendance appears here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader
        title="My attendance"
        description="Only submitted registers are counted. Late counts as present."
      />

      <StudentAttendanceView
        initial={{
          enrollment: data.enrollment,
          overall: data.overall,
          bySubject: data.bySubject.map((s) => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            present: s.present,
            absent: s.absent,
            late: s.late,
            leave: s.leave,
            total: s.total,
            attended: s.attended,
            percentage: s.percentage,
          })),
          daily: data.daily
            ? {
                subjectId: data.daily.subjectId,
                subjectName: data.daily.subjectName,
                present: data.daily.present,
                absent: data.daily.absent,
                late: data.daily.late,
                leave: data.daily.leave,
                total: data.daily.total,
                attended: data.daily.attended,
                percentage: data.daily.percentage,
              }
            : null,
          history: {
            items: data.history.items,
            page: data.history.page,
            pageSize: data.history.pageSize,
            total: data.history.total,
            totalPages: data.history.totalPages,
          },
          subjectsInHistory: data.subjectsInHistory,
        }}
      />
    </>
  )
}

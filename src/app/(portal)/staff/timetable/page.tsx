import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyTimetable } from '@/server/services/timetable.service'
import { ForbiddenError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { TeacherTimetableGrid } from '@/features/timetable/teacher-timetable'

export const metadata: Metadata = { title: 'My timetable' }
export const dynamic = 'force-dynamic'

/**
 * Staff → my own week.
 *
 * The teacher is `ctx.staffId`, resolved from the session. There is no
 * parameter for whose timetable this is, so there is nothing to change in the
 * address bar to see somebody else's.
 */
export default async function StaffTimetablePage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let timetable
  try {
    timetable = await getMyTimetable(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My timetable" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your
            timetable appears here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader
        title="My timetable"
        description={
          timetable.sessionName
            ? `My weekly classes · Session ${timetable.sessionName}`
            : 'My weekly classes'
        }
      />
      <TeacherTimetableGrid timetable={timetable} />
    </>
  )
}

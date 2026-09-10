import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getTimetableOptions } from '@/server/services/timetable.service'
import { PageHeader } from '@/components/layout/app-shell'
import { TimetableBuilder } from '@/features/timetable/timetable-builder'
import { PeriodsEditor } from '@/features/timetable/periods-editor'
import { getCollegePeriods } from '@/server/timetable/period-settings'
import { can } from '@/server/auth/context'

export const metadata: Metadata = { title: 'Timetable' }
export const dynamic = 'force-dynamic'

/**
 * Admin → the weekly master timetable, one section at a time.
 *
 * The page authenticates, authorises through the service (which requires
 * `timetable.view` and the admin role) and hands the builder plain serializable
 * data. Everything interactive lives in the client component, which talks to
 * the API; no query runs in the browser, and no function crosses the boundary.
 */
export default async function AdminTimetablePage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const [options, periods] = await Promise.all([getTimetableOptions(ctx), getCollegePeriods()])

  return (
    <>
      <PageHeader
        title="Timetable"
        description="The weekly master timetable. Choose a session and a section to build its week."
      />
      <TimetableBuilder initialOptions={options} />

      {/* The bells themselves. Kept below the week the office came here to
          build, because changing the day is the rarer errand. */}
      {can(ctx, 'settings.manage') ? (
        <div className="mt-6">
          <PeriodsEditor initial={periods} />
        </div>
      ) : null}
    </>
  )
}

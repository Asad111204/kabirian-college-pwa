import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import {
  getSectionTimetable,
  getTimetableOptions,
  type SectionTimetable,
} from '@/server/services/timetable.service'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { TimetableBuilder } from '@/features/timetable/timetable-builder'

export const metadata: Metadata = { title: 'Timetable' }
export const dynamic = 'force-dynamic'

/**
 * Admin → the weekly master timetable, one section at a time.
 *
 * The page fetches through the service, which requires `timetable.view` and the
 * admin role; the builder is a client component that receives plain data and
 * calls the API. No query runs in the browser.
 */
export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { sectionId } = await searchParams

  const options = await getTimetableOptions(ctx)

  let timetable: SectionTimetable | null = null
  let notFound = false
  if (sectionId) {
    try {
      timetable = await getSectionTimetable(ctx, sectionId)
    } catch (error) {
      if (error instanceof NotFoundError) notFound = true
      else throw error
    }
  }

  return (
    <>
      <PageHeader
        title="Timetable"
        description="The weekly master timetable. Choose a section to build its week."
      />

      {notFound ? (
        <Alert variant="warning" className="mb-4" title="That section could not be found">
          Choose a section from the list below.
        </Alert>
      ) : null}

      <TimetableBuilder options={options} timetable={timetable} />
    </>
  )
}

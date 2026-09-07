import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyEventFeed } from '@/server/services/events.service'
import { eventFeedQuerySchema } from '@/validation/notices'
import { PageHeader } from '@/components/layout/app-shell'
import { EventFeed } from '@/features/events/event-feed'

export const metadata: Metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

/**
 * Student → Events. The first page is fetched here from the
 * signed-in reader's own scope; the client component pages and filters
 * through the same API, which decides what reaches them.
 */
export default async function StudentEventsPage() {
  const ctx = await requirePortalAccess(['STUDENT'])
  const initial = await getMyEventFeed(ctx, eventFeedQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="Events" description="What is coming up at the college." />
      <EventFeed initial={initial} />
    </>
  )
}

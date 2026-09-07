import type { Metadata } from 'next'
import { can, requirePortalAccess } from '@/server/auth/context'
import { listEvents } from '@/server/services/events.service'
import { eventListQuerySchema } from '@/validation/notices'
import { PageHeader } from '@/components/layout/app-shell'
import { EventList } from '@/features/events/event-list'

export const metadata: Metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = eventListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : eventListQuerySchema.parse({})

  const result = await listEvents(ctx, query)

  return (
    <>
      <PageHeader title="Events" description="Sports days, meetings and gatherings, with a picture." />
      <EventList
        events={result.items}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{ status: query.status ?? '', search: query.search ?? '', upcoming: query.upcoming }}
        canManage={can(ctx, 'events.manage')}
      />
    </>
  )
}

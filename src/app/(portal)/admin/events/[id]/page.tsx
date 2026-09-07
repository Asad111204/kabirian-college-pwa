import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { can, requirePortalAccess } from '@/server/auth/context'
import { NotFoundError } from '@/server/api/errors'
import { getEvent } from '@/server/services/events.service'
import { isDocumentStorageReady } from '@/server/services/documents.service'
import { PageHeader } from '@/components/layout/app-shell'
import { EventDetail } from '@/features/events/event-detail'

export const metadata: Metadata = { title: 'Event' }
export const dynamic = 'force-dynamic'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let event
  try {
    event = await getEvent(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const storageReady = await isDocumentStorageReady()

  return (
    <>
      <div className="mb-3">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All events
        </Link>
      </div>
      <PageHeader title={event.title} />
      <EventDetail initial={event} canManage={can(ctx, 'events.manage')} storageReady={storageReady} />
    </>
  )
}

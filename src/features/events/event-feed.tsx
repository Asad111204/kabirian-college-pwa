'use client'

import * as React from 'react'
import { CalendarDays, MapPin, Paperclip } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { api, ApiError } from '@/lib/api-client'
import type { PaginatedResult } from '@/server/services/service-utils'
import type { FeedEvent } from '@/server/services/events.service'
import { EventStatusBadge, formatCollegeLocal } from '@/features/notices/shared'

/**
 * The events for the signed-in reader: upcoming first, the past on request.
 * Read-only; a cancelled event is shown, marked, so nobody turns up.
 */
export function EventFeed({ initial }: { initial: PaginatedResult<FeedEvent> }) {
  const [result, setResult] = React.useState(initial)
  const [includePast, setIncludePast] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function load(next: { includePast?: boolean; page?: number }) {
    const past = next.includePast ?? includePast
    const page = next.page ?? 1
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (past) params.set('includePast', 'true')
      if (page > 1) params.set('page', String(page))
      const query = params.toString()
      setResult(await api.get<PaginatedResult<FeedEvent>>(`/api/v1/events/feed${query ? `?${query}` : ''}`))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The events could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Checkbox
        checked={includePast}
        onChange={(e) => {
          setIncludePast(e.target.checked)
          void load({ includePast: e.target.checked, page: 1 })
        }}
        label="Show past events too"
      />

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming events"
          description={includePast ? 'Nothing has been held yet either.' : 'Nothing is planned at the moment.'}
        />
      ) : (
        <ul className="space-y-3">
          {result.items.map((event) => (
            <li key={event.id}>
              <Card className="overflow-hidden">
                {event.coverDocumentId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/v1/documents/${event.coverDocumentId}/content`}
                    alt=""
                    className="max-h-56 w-full object-cover"
                  />
                ) : null}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {event.status === 'CANCELLED' ? <EventStatusBadge status="CANCELLED" /> : null}
                    <span className="text-sm font-medium text-foreground">
                      {formatCollegeLocal(event.startsAtLocal)}
                      {event.endsAtLocal ? ` – ${formatCollegeLocal(event.endsAtLocal)}` : ''}
                    </span>
                  </div>
                  <h3
                    className={`mt-1 text-base font-semibold ${event.status === 'CANCELLED' ? 'text-foreground-muted line-through' : 'text-foreground'}`}
                  >
                    {event.title}
                  </h3>
                  {event.location ? (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-foreground-muted">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {event.location}
                    </p>
                  ) : null}
                  {event.description ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{event.description}</p>
                  ) : null}
                  {event.attachments.filter((a) => !a.isImage || a.id !== event.coverDocumentId).length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {event.attachments
                        .filter((a) => a.id !== event.coverDocumentId)
                        .map((file) => (
                          <li key={file.id} className="flex items-center gap-2 text-sm">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
                            <a
                              href={`/api/v1/documents/${file.id}/content`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-primary hover:underline"
                            >
                              {file.originalFileName}
                            </a>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          onPageChange={(page) => void load({ page })}
          disabled={loading}
        />
      ) : null}
    </div>
  )
}

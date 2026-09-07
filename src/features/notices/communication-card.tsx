import * as React from 'react'
import Link from 'next/link'
import { CalendarDays, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FeedNotice } from '@/server/services/notices.service'
import type { FeedEvent } from '@/server/services/events.service'
import { CategoryBadge, EventStatusBadge, PinnedBadge, formatCollegeLocal } from './shared'

/**
 * The dashboard's window on notices and events: the latest few that reach
 * this reader, and the next few events. Presentational; the server has
 * already decided what reaches them.
 */
export function NoticesCard({ notices, href }: { notices: FeedNotice[]; href: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Notices</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {notices.length === 0 ? 'Nothing for you at the moment.' : 'The latest for you.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href={href}>All notices</Link>
        </Button>
      </CardHeader>
      {notices.length > 0 ? (
        <CardContent>
          <ul className="divide-y divide-border">
            {notices.map((notice) => (
              <li key={notice.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
                  <Link href={href} className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline">
                    {notice.title}
                  </Link>
                  {notice.isPinned ? <PinnedBadge /> : null}
                  <CategoryBadge category={notice.category} />
                </div>
                <p className="mt-0.5 pl-5 text-xs text-foreground-muted">{formatCollegeLocal(notice.publishAtLocal)}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}

export function EventsCard({ events, href }: { events: FeedEvent[]; href: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Upcoming events</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {events.length === 0 ? 'Nothing is planned at the moment.' : 'What is coming up.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href={href}>All events</Link>
        </Button>
      </CardHeader>
      {events.length > 0 ? (
        <CardContent>
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-foreground-muted">
                    {formatCollegeLocal(event.startsAtLocal)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </div>
                {event.status === 'CANCELLED' ? <EventStatusBadge status="CANCELLED" /> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}

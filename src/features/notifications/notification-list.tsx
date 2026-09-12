'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BellOff, CheckCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { NotificationView } from '@/server/services/notifications.service'
import type { PaginatedResult } from '@/server/services/service-utils'

/**
 * Everything the college has told this person.
 *
 * Opening one marks it read and takes it, and its share of the count, away.
 * Nothing here is anybody else's: the list is the signed-in person's own.
 */
export function NotificationList({ page }: { page: PaginatedResult<NotificationView> }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const unread = page.items.filter((item) => !item.read).length

  return (
    <>
      {unread > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.post('/api/v1/notifications/read-all', {})
                router.refresh()
              } finally {
                setBusy(false)
              }
            }}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        </div>
      ) : null}

      {page.items.length === 0 ? (
        <Card>
          <EmptyState icon={BellOff} title="Nothing yet" description="When the school posts a notice, sets homework or answers you, it will appear here." />
        </Card>
      ) : (
        <ul className="space-y-2">
          {page.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.link}
                onClick={() => void api.post(`/api/v1/notifications/${item.id}/read`).catch(() => undefined)}
                className={cn(
                  'flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:bg-surface-muted',
                  item.read ? '' : 'border-primary/40 bg-primary/5',
                )}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-danger-600')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{item.title}</span>
                  {item.body ? <span className="mt-0.5 block text-sm text-foreground-muted">{item.body}</span> : null}
                  <span className="mt-1 block text-xs text-foreground-subtle">{formatDateTime(item.createdAt)}</span>
                </span>
                <Badge variant="neutral">{item.kindLabel}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.total > page.pageSize ? (
        <div className="mt-4">
          <Pagination
            page={page.page}
            pageSize={page.pageSize}
            total={page.total}
            totalPages={page.totalPages}
            onPageChange={(next) => router.push(`/notifications?page=${next}`)}
          />
        </div>
      ) : null}
    </>
  )
}

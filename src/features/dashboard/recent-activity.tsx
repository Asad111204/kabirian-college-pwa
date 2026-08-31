import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'
import { relativeTime, type ActivityItem } from '@/server/services/dashboard-helpers'

const TONE_DOT = {
  neutral: 'bg-ink-400',
  positive: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
} as const

/**
 * The last few administrative changes, taken from the audit log.
 *
 * Each line is built from the action name, the actor's name and the record's
 * label only. The stored before/after snapshots are never fetched or shown —
 * this is a summary, and the full audit viewer comes in Phase 14.
 */
export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Recent activity</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            Administrative changes, newest first
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Changes to accounts and the academic structure will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span
                  className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[item.tone])}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{item.actor}</span>{' '}
                    <span className="text-foreground-muted">{item.description}</span>
                    {item.target ? <span className="font-medium"> {item.target}</span> : null}
                  </p>
                  <p className="text-xs text-foreground-subtle">
                    <time dateTime={item.createdAt.toISOString()}>
                      {relativeTime(item.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

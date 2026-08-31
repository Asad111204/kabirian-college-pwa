'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * Re-fetches the dashboard on demand.
 *
 * The page is server-rendered on every visit, so the figures are always current
 * when it loads. This button covers the case where an administrator leaves the
 * tab open — a deliberate click, rather than background polling that would hit
 * the database every few seconds for no real benefit.
 */
export function RefreshButton({ generatedAt }: { generatedAt: string }) {
  const router = useRouter()
  const [refreshing, startRefresh] = React.useTransition()

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-foreground-subtle sm:inline">
        Updated{' '}
        <time dateTime={generatedAt}>
          {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(generatedAt),
          )}
        </time>
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => startRefresh(() => router.refresh())}
        disabled={refreshing}
      >
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  )
}

'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOnlineStatus } from '@/lib/pwa/use-online'

/** "Try again" on the offline page: reloads, and says when the connection is back. */
export function RetryButton() {
  const online = useOnlineStatus()
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <Button onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
      <p className="text-xs text-foreground-subtle" aria-live="polite">
        {online ? 'Your connection looks to be back.' : 'Still offline.'}
      </p>
    </div>
  )
}

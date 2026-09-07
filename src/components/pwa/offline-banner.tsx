'use client'

import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOnlineStatus } from '@/lib/pwa/use-online'

/**
 * A strip that appears the moment the browser loses its connection and goes
 * the moment it is back. What is on screen stays readable; anything that
 * needs the server will say so when tried.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center gap-2 bg-warning-50 px-4 py-2 text-sm text-warning-700', className)}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">You are offline.</span> What is on screen stays; saving, loading and signing in need a connection.
      </span>
    </div>
  )
}

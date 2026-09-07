import type { Metadata } from 'next'
import { Logo } from '@/components/layout/logo'
import { RetryButton } from '@/components/pwa/retry-button'

export const metadata: Metadata = { title: 'Offline' }
export const dynamic = 'force-dynamic'

/**
 * The page the service worker shows when a page cannot be fetched.
 *
 * It is precached at install time, so it is the one page that renders with
 * no network at all. It reads no session and shows no data: it only says
 * what is happening and offers to try again.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-center">
      <Logo size={48} className="text-primary" />
      <h1 className="mt-6 text-2xl font-semibold text-foreground">You are offline</h1>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">
        This page needs an internet connection. Attendance, marks, notices and every other record live on the
        college server, so nothing is stored on this device. Check your connection and try again.
      </p>
      <RetryButton />
    </main>
  )
}

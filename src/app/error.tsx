'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The page shown when rendering throws.
 *
 * The user sees that something went wrong and a way to try again; the
 * details stay on the server, where the logger has already recorded them.
 * Next.js strips the message from `error` in production, so nothing
 * technical can reach the screen even by accident.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The browser console is the one place a developer can see the reference.
    console.error('Page failed to render', error.digest ?? '')
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-center">
      <AlertCircle className="h-10 w-10 text-danger-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">
        The page could not be shown. Nothing you entered has been lost on the server; please try again.
        {error.digest ? (
          <>
            <br />
            <span className="text-xs text-foreground-subtle">Reference: {error.digest}</span>
          </>
        ) : null}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <a href="/">Start page</a>
        </Button>
      </div>
    </main>
  )
}

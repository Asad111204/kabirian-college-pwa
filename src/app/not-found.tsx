import Link from 'next/link'
import { connection } from 'next/server'
import { LogoFull } from '@/components/layout/logo'

/**
 * The page for an address that does not exist.
 *
 * `connection()` makes this render per request rather than at build time, so
 * it carries the request's CSP nonce like every other page (see src/proxy.ts).
 * It says nothing about what does exist: a visitor who is not signed in learns
 * only that there is nothing here.
 */
export default async function NotFound() {
  await connection()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-center">
      <LogoFull height={44} />
      <h1 className="mt-6 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">
        There is nothing at this address. It may have moved, or the link may have been typed incorrectly.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-primary hover:underline">
        Go to the start page
      </Link>
    </main>
  )
}

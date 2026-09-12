import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthContext, portalPathForRole } from '@/server/auth/context'
import { env } from '@/server/config/env'
import { LogoFull } from '@/components/layout/logo'
import { OfflineBanner } from '@/components/pwa/offline-banner'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  // Already signed in? Go straight to the portal.
  const ctx = await getAuthContext()
  if (ctx) redirect(ctx.mustChangePassword ? '/change-password' : portalPathForRole(ctx.role))

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoFull height={128} />
          <h1 className="mt-4 text-xl font-semibold text-foreground">{env.APP_COLLEGE_NAME}</h1>
          <p className="mt-1 text-sm text-foreground-muted">Management System</p>
        </div>

        <OfflineBanner className="mb-4 rounded-[var(--radius-control)]" />
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs text-foreground-muted">
          Accounts are created by the school administration.
          <br />
          Forgot your password? Please contact the admin office.
        </p>
      </div>
    </main>
  )
}

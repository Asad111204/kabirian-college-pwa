import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthContext } from '@/server/auth/context'
import { env } from '@/server/config/env'
import { Logo } from '@/components/layout/logo'
import { Alert } from '@/components/ui/feedback'
import { ChangePasswordForm } from './change-password-form'

export const metadata: Metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')

  const forced = ctx.mustChangePassword

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={48} className="text-primary" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">{env.APP_COLLEGE_NAME}</h1>
        </div>

        <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-sm">
          {forced ? (
            <Alert variant="warning" title="Choose a new password">
              You are signed in with a temporary password. Please set your own password before
              continuing.
            </Alert>
          ) : null}

          <ChangePasswordForm username={ctx.username} forced={forced} />
        </div>
      </div>
    </main>
  )
}

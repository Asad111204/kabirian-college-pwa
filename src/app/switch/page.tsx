import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getAuthContext } from '@/server/auth/context'
import { env } from '@/server/config/env'
import { LogoFull } from '@/components/layout/logo'
import { PORTAL_LABEL, canUsePortal, portalPathFor } from '@/server/auth/portals'
import type { UserRole } from '@/generated/prisma/enums'
import { SwitchPortalForm } from './switch-portal-form'

export const metadata: Metadata = { title: 'Switch portal' }
export const dynamic = 'force-dynamic'

/**
 * Where somebody with two portals lands when they follow a link into the one
 * they are not currently working in — a bookmark into the office, say, while
 * they are teaching.
 *
 * It asks rather than switching by itself: loading a page should not quietly
 * change what a person is acting as, and the switch is a POST like every
 * other change.
 */
export default async function SwitchPortalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (ctx.mustChangePassword) redirect('/change-password')

  const params = await searchParams
  const requested = typeof params.to === 'string' ? params.to : ''
  const account = { role: ctx.accountRole, adminAccess: ctx.adminAccess }
  const to = (['ADMIN', 'STAFF'] as UserRole[]).find((role) => role === requested && canUsePortal(account, role))

  // Nothing to offer: send them where they already belong rather than
  // explaining a portal they do not have.
  if (!to || to === ctx.role) redirect(portalPathFor(ctx.role))

  // Only somewhere inside this app, and never a protocol-relative address.
  const raw = typeof params.next === 'string' ? params.next : ''
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : portalPathFor(to)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoFull height={44} />
          <h1 className="mt-4 text-lg font-semibold text-foreground">{env.APP_COLLEGE_NAME}</h1>
        </div>

        <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-foreground">Switch to the {PORTAL_LABEL[to].toLowerCase()} portal?</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              You are working in the {PORTAL_LABEL[ctx.role].toLowerCase()} portal, and that page belongs to the{' '}
              {PORTAL_LABEL[to].toLowerCase()} one. Your account has both.
            </p>
          </div>
          <SwitchPortalForm to={to} next={next} stayPath={portalPathFor(ctx.role)} label={PORTAL_LABEL[to].toLowerCase()} />
        </div>
      </div>
    </main>
  )
}

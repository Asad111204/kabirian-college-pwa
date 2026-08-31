/**
 * Layout shared by all three portals.
 *
 * Nothing is rendered until `requirePortalAccess` has confirmed on the SERVER
 * who the user is. This is the real access check — not a client-side guard that
 * could be skipped by editing the page in a browser.
 */
import { getAuthContext, portalPathForRole } from '@/server/auth/context'
import { getCurrentAcademicSession } from '@/server/services/academic-structure.service'
import { env } from '@/server/config/env'
import { AppShell } from '@/components/layout/app-shell'
import { redirect } from 'next/navigation'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()

  if (!ctx) redirect('/login')
  if (ctx.mustChangePassword) redirect('/change-password')

  // Read the current session once here rather than in every page.
  const currentSession = await getCurrentAcademicSession()

  return (
    <AppShell
      user={{ fullName: ctx.fullName, username: ctx.username, role: ctx.role }}
      collegeName={env.APP_COLLEGE_NAME}
      sessionLabel={currentSession?.name ?? null}
    >
      {children}
    </AppShell>
  )
}

export { portalPathForRole }

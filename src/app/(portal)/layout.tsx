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
import { currentPhotoIds } from '@/server/services/documents.service'
import { AppShell } from '@/components/layout/app-shell'
import { redirect } from 'next/navigation'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()

  if (!ctx) redirect('/login')
  if (ctx.mustChangePassword) redirect('/change-password')

  // Read the current session once here rather than in every page.
  const currentSession = await getCurrentAcademicSession()

  // Their own photograph for the user menu, when they have one on file.
  const photoUrl = await ownPhotoUrl(ctx)

  return (
    <AppShell
      user={{ fullName: ctx.fullName, username: ctx.username, role: ctx.role, portals: ctx.portals, photoUrl }}
      collegeName={env.APP_COLLEGE_NAME}
      sessionLabel={currentSession?.name ?? null}
    >
      {children}
    </AppShell>
  )
}

export { portalPathForRole }

async function ownPhotoUrl(ctx: { studentId: string | null; staffId: string | null }): Promise<string | null> {
  if (ctx.studentId) {
    const id = (await currentPhotoIds('STUDENT', [ctx.studentId])).get(ctx.studentId)
    return id ? `/api/v1/students/${ctx.studentId}/photo?v=${id}` : null
  }
  if (ctx.staffId) {
    const id = (await currentPhotoIds('STAFF', [ctx.staffId])).get(ctx.staffId)
    return id ? `/api/v1/staff/${ctx.staffId}/photo?v=${id}` : null
  }
  return null
}

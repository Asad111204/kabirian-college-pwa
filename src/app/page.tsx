import { redirect } from 'next/navigation'
import { getAuthContext, portalPathForRole } from '@/server/auth/context'

/**
 * The site root simply sends people where they belong:
 * signed out -> login, signed in -> their own portal.
 */
export default async function HomePage() {
  const ctx = await getAuthContext()

  if (!ctx) redirect('/login')
  if (ctx.mustChangePassword) redirect('/change-password')

  redirect(portalPathForRole(ctx.role))
}

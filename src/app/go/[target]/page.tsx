import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/server/auth/context'
import { isShortcutTarget, shortcutPath } from '@/lib/pwa/shortcuts'

/**
 * `/go/attendance`, `/go/timetable`, `/go/notices`, `/go/results` — the
 * targets of the home-screen shortcuts in the web app manifest. Signed out
 * goes to sign in; signed in goes to that role's page.
 */
export default async function ShortcutPage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  if (!isShortcutTarget(target)) notFound()

  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (ctx.mustChangePassword) redirect('/change-password')

  redirect(shortcutPath(target, ctx.role))
}

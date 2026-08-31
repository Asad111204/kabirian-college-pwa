import { requirePortalAccess } from '@/server/auth/context'

/**
 * Admin portal guard. A staff member or student who types /admin in the address
 * bar is redirected to their own portal by this server-side check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess(['ADMIN'])
  return <>{children}</>
}

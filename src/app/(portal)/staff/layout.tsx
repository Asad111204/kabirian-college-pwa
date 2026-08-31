import { requirePortalAccess } from '@/server/auth/context'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess(['STAFF'])
  return <>{children}</>
}

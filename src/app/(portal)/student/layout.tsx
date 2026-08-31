import { requirePortalAccess } from '@/server/auth/context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess(['STUDENT'])
  return <>{children}</>
}

import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listMySessions } from '@/server/services/sessions.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { SessionList } from '@/features/sessions/session-list'

export const metadata: Metadata = { title: 'Signed-in devices' }
export const dynamic = 'force-dynamic'

/**
 * Account → Signed-in devices, for everyone: admin, staff and students alike.
 * The list is the caller's own sessions and nothing else — the service reads
 * `ctx.userId`, never an id from the address.
 */
export default async function DevicesPage() {
  const ctx = await requirePortalAccess(['ADMIN', 'STAFF', 'STUDENT'])
  const sessions = await listMySessions(ctx)

  return (
    <>
      <PageHeader
        title="Signed-in devices"
        description="Every browser or phone where this account is currently signed in. If one of these is not yours, sign it out and change your password."
      />
      <Card>
        <CardHeader>
          <CardTitle>{ctx.fullName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="info">
            Signing out a device ends that session at once. Changing your password signs out every device, including this one.
          </Alert>
          <SessionList
            sessions={sessions.map((s) => ({
              ...s,
              createdAt: s.createdAt.toISOString(),
              lastActiveAt: s.lastActiveAt.toISOString(),
              expiresAt: s.expiresAt.toISOString(),
            }))}
            self
            canRevoke
            revokeBase="/api/v1/me/sessions"
            signOutOthersUrl="/api/v1/me/sessions/sign-out-others"
          />
        </CardContent>
      </Card>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requirePortalAccess, can } from '@/server/auth/context'
import { getUser, getUserPermissions } from '@/server/services/users.service'
import { prisma } from '@/server/db/prisma'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { formatDateTime } from '@/lib/format'
import { AccountStatusBadge, RoleBadge } from '@/features/users/shared'
import { UserActions } from '@/features/users/user-actions'
import { PermissionsEditor } from '@/features/users/permissions-editor'

export const metadata: Metadata = { title: 'User account' }
export const dynamic = 'force-dynamic'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let user
  try {
    user = await getUser(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [permissions, activeAdminCount, rawUser] = await Promise.all([
    getUserPermissions(ctx, id),
    prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    prisma.user.findUnique({ where: { id }, select: { fullName: true } }),
  ])

  const isSelf = ctx.userId === user.id

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href="/admin/users">
          <ArrowLeft className="h-4 w-4" />
          Back to user accounts
        </Link>
      </Button>

      <PageHeader
        title={user.displayName}
        description={`Username: ${user.username}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} />
            <AccountStatusBadge status={user.status} isLocked={user.isLocked} />
            {user.isSystemOwner ? <Badge variant="brand">System owner</Badge> : null}
            {isSelf ? <Badge variant="info">This is you</Badge> : null}
          </div>
        }
      />

      {user.isSystemOwner ? (
        <Alert variant="info" className="mb-4" title="Protected account">
          This is the first administrator account. It cannot be deactivated, given a different role,
          or stripped of user-management permissions — that guarantees the college can never be
          locked out of its own system.
        </Alert>
      ) : null}

      {user.mustChangePassword ? (
        <Alert variant="warning" className="mb-4">
          This account still has a temporary password. The person will be asked to choose their own
          the next time they sign in.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Full name" value={user.displayName} />
              <Detail label="Username" value={user.username} mono />
              <Detail label="Email" value={user.email ?? '—'} />
              <Detail label="Role" value={user.role} />
              <Detail label="Created" value={formatDateTime(user.createdAt)} />
              <Detail label="Last sign-in" value={formatDateTime(user.lastLoginAt)} />
              <Detail label="Password changed" value={formatDateTime(user.passwordChangedAt)} />
              <Detail
                label="Active sessions"
                value={String(user.activeSessionCount)}
              />
              <Detail
                label="Linked record"
                value={
                  user.profile
                    ? `${user.profile.type === 'STAFF' ? 'Staff' : 'Student'} · ${user.profile.code} · ${user.profile.name}`
                    : 'None'
                }
              />
              {user.isLocked ? (
                <Detail
                  label="Locked until"
                  value={formatDateTime(user.lockedUntil)}
                />
              ) : null}
            </dl>

            {!user.profile && user.role !== 'ADMIN' ? (
              <Alert variant="info" className="mt-4">
                This account has no {user.role === 'STAFF' ? 'staff' : 'student'} record linked yet.
                Records are created in {user.role === 'STAFF' ? 'Staff Management (Phase 5)' : 'Student Management (Phase 4)'}
                , and the account can be linked to one then.
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <UserActions
          user={{
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            fullNameValue: rawUser?.fullName ?? user.displayName,
            email: user.email,
            role: user.role,
            status: user.status,
            isLocked: user.isLocked,
            isSystemOwner: user.isSystemOwner,
            activeSessionCount: user.activeSessionCount,
            hasProfile: user.profile !== null,
          }}
          isSelf={isSelf}
          activeAdminCount={activeAdminCount}
          canManagePermissions={can(ctx, 'permissions.manage')}
        />
      </div>

      <div className="mt-4">
        <PermissionsEditor
          userId={user.id}
          userName={user.displayName}
          role={permissions.role}
          modules={permissions.modules}
          canEdit={can(ctx, 'permissions.manage')}
        />
      </div>
    </>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

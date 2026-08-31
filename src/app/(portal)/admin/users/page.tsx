import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listUsers } from '@/server/services/users.service'
import { userListQuerySchema } from '@/validation/users'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { UsersTable } from '@/features/users/users-table'

export const metadata: Metadata = { title: 'User Accounts' }
export const dynamic = 'force-dynamic'

/**
 * Admin -> User Management.
 *
 * `requirePortalAccess(['ADMIN'])` runs on the server before anything renders,
 * and every service call checks the `users.view` permission again — so this
 * page cannot be reached by a staff member or student, with or without JavaScript.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  // Unknown or malformed query values fall back to the defaults rather than
  // throwing — a shared link with a stale filter should still open.
  const parsed = userListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : userListQuerySchema.parse({})

  const result = await listUsers(ctx, query)

  return (
    <>
      <PageHeader
        title="User Accounts"
        description="Create sign-in accounts for administrators, staff and students, and control what each person can do."
      />

      <UsersTable
        users={result.items.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
        }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        counts={result.counts}
        filters={{
          search: query.search ?? '',
          role: query.role,
          status: query.status,
          sort: query.sort,
          direction: query.direction,
        }}
      />

      <Alert variant="info" className="mt-4">
        Accounts are never deleted, because attendance, marks and audit records refer to them.
        Deactivate an account instead — the person can no longer sign in, and every historical
        record stays intact.
      </Alert>
    </>
  )
}

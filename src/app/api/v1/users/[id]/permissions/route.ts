import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getUserPermissions, setUserPermissions } from '@/server/services/users.service'
import { userPermissionsSchema } from '@/validation/users'

/** The full picture: role default, override, and the effective result. */
export const GET = withAuth(async ({ ctx, params }) =>
  jsonOk(await getUserPermissions(ctx, params.id!)),
)

/** Replaces this user's overrides. Requires the `permissions.manage` permission. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, userPermissionsSchema)
  return jsonOk(await setUserPermissions(ctx, params.id!, input))
})

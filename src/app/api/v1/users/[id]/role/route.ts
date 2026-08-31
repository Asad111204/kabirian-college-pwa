import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { changeUserRole } from '@/server/services/users.service'
import { userRoleSchema } from '@/validation/users'

/**
 * Change a user's role.
 *
 * Because the role decides what the person may do, this also clears their
 * individual permission overrides (which were chosen for the old role) and
 * signs them out so their next session is built from the new role.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, userRoleSchema)
  return jsonOk(await changeUserRole(ctx, params.id!, input.role))
})

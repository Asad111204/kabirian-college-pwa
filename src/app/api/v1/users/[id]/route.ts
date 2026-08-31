import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getUser, updateUser } from '@/server/services/users.service'
import { userUpdateSchema } from '@/validation/users'

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getUser(ctx, params.id!)))

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, userUpdateSchema)
  return jsonOk(await updateUser(ctx, params.id!, input))
})

/**
 * There is deliberately no DELETE.
 * Accounts are referenced by attendance, marks and audit records, so they are
 * deactivated rather than removed — see PATCH /api/v1/users/{id}/status.
 */

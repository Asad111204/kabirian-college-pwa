import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setUserStatus } from '@/server/services/users.service'
import { userStatusSchema } from '@/validation/users'

/**
 * Activate or deactivate an account.
 * Deactivating deletes every session the person has, so they are signed out
 * everywhere within the same request — not whenever their cookie happens to
 * expire.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, userStatusSchema)
  return jsonOk(await setUserStatus(ctx, params.id!, input.status))
})

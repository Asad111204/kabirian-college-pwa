import { jsonOk, withAuth } from '@/server/api/handler'
import { revokeUserSessions } from '@/server/services/users.service'
import { listUserSessions } from '@/server/services/sessions.service'

/** GET /api/v1/users/:id/sessions — the account's signed-in devices. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await listUserSessions(ctx, params.id!)))

/** DELETE /api/v1/users/:id/sessions — signs the user out on every device without changing their password. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  const revoked = await revokeUserSessions(ctx, params.id!)
  return jsonOk({ revoked })
})

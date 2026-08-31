import { jsonOk, withAuth } from '@/server/api/handler'
import { revokeUserSessions } from '@/server/services/users.service'

/** Signs the user out on every device without changing their password. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  const revoked = await revokeUserSessions(ctx, params.id!)
  return jsonOk({ revoked })
})

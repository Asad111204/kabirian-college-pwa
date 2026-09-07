import { jsonOk, withAuth } from '@/server/api/handler'
import { revokeMyOtherSessions } from '@/server/services/sessions.service'

/** POST /api/v1/me/sessions/sign-out-others — ends every session but this one. */
export const POST = withAuth(async ({ ctx }) => jsonOk({ revoked: await revokeMyOtherSessions(ctx) }))

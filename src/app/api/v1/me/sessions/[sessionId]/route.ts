import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { revokeMySession } from '@/server/services/sessions.service'
import { clearSessionCookie } from '@/server/auth/session'
import { uuid } from '@/validation/common'

/**
 * DELETE /api/v1/me/sessions/:sessionId — ends one of the caller's own
 * sessions. Ending the current one also clears this browser's cookie, so the
 * next page load lands on the sign-in screen cleanly.
 */
export const DELETE = withAuth(async ({ ctx, params }) => {
  const sessionId = uuid.safeParse(params.sessionId)
  if (!sessionId.success) throw new ValidationError('That is not a valid session.')
  const { wasCurrent } = await revokeMySession(ctx, sessionId.data)
  if (wasCurrent) await clearSessionCookie()
  return jsonOk({ revoked: true, wasCurrent })
})

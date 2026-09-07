import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { revokeUserSession } from '@/server/services/sessions.service'
import { uuid } from '@/validation/common'

/** DELETE /api/v1/users/:id/sessions/:sessionId — ends one device's session. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  const sessionId = uuid.safeParse(params.sessionId)
  if (!sessionId.success) throw new ValidationError('That is not a valid session.')
  await revokeUserSession(ctx, params.id!, sessionId.data)
  return jsonOk({ revoked: true })
})

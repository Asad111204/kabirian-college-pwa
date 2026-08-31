import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getAssignmentOptions } from '@/server/services/staff.service'

/**
 * Every Class x Division x Program in a session, with its sections and the
 * subjects its curriculum contains — one request, so the cascading dropdowns
 * need no round trip per step.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) throw new ValidationError('A sessionId is required.')
  return jsonOk(await getAssignmentOptions(ctx, sessionId))
})

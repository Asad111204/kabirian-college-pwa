import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyAssignments } from '@/server/services/staff-portal.service'

/**
 * The signed-in teacher's own assignments. The staff id comes from the session,
 * never from the request, so nobody can ask for another teacher's work.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined
  return jsonOk(await getMyAssignments(ctx, sessionId))
})

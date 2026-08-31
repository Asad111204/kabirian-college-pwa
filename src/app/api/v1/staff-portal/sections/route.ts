import { jsonOk, withAuth } from '@/server/api/handler'
import { getMySections } from '@/server/services/staff-portal.service'

/** The distinct sections this teacher can reach, with the subjects they teach. */
export const GET = withAuth(async ({ request, ctx }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined
  return jsonOk(await getMySections(ctx, sessionId))
})

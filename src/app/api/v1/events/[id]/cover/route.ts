import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setEventCover } from '@/server/services/events.service'
import { eventCoverSchema } from '@/validation/notices'

/** PUT /api/v1/events/[id]/cover -- make one of the event's own pictures the cover, or clear it. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const { documentId } = await parseJsonBody(request, eventCoverSchema)
  return jsonOk(await setEventCover(ctx, params.id!, documentId))
})

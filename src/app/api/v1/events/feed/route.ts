import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { getMyEventFeed } from '@/server/services/events.service'
import { ValidationError } from '@/server/api/errors'
import { eventFeedQuerySchema } from '@/validation/notices'

/** GET /api/v1/events/feed -- the events for the signed-in reader: upcoming, or all with ?includePast=true. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = eventFeedQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getMyEventFeed(ctx, parsed.data))
})

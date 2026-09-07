import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyEvent } from '@/server/services/events.service'

/** GET /api/v1/events/feed/[id] -- one event, if it is for this reader. Otherwise 404. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getMyEvent(ctx, params.id!)))

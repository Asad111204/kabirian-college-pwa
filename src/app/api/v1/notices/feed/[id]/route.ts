import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyNotice } from '@/server/services/notices.service'

/** GET /api/v1/notices/feed/[id] -- one notice, if it reaches this reader. Otherwise 404. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getMyNotice(ctx, params.id!)))

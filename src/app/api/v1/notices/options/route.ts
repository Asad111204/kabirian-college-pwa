import { jsonOk, withAuth } from '@/server/api/handler'
import { getNoticeTargetOptions } from '@/server/services/notices.service'

/** GET /api/v1/notices/options -- what a notice may be aimed at. Admin only. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getNoticeTargetOptions(ctx)))

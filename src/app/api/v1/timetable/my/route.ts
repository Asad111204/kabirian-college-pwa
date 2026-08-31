import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyTimetable } from '@/server/services/timetable.service'

/**
 * The signed-in teacher's own week.
 *
 * There is no parameter for whose timetable it is. The service resolves the
 * teacher from `ctx.staffId`, so this endpoint cannot be pointed at anybody
 * else however the request is written.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getMyTimetable(ctx)))

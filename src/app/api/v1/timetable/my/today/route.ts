import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyClassesToday } from '@/server/services/timetable.service'

/**
 * What the signed-in teacher is teaching today.
 *
 * "Today" is the college's own date in Asia/Karachi, decided on the server.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getMyClassesToday(ctx)))

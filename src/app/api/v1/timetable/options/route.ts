import { jsonOk, withAuth } from '@/server/api/handler'
import { getTimetableOptions } from '@/server/services/timetable.service'

/** The sections an administrator may build a timetable for. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getTimetableOptions(ctx)))

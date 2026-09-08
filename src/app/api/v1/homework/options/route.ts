import { jsonOk, withAuth } from '@/server/api/handler'
import { getHomeworkOptions } from '@/server/services/homework.service'

/** GET /api/v1/homework/options — the section+subject pairs this person may set homework for. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getHomeworkOptions(ctx)))

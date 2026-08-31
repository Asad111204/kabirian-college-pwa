import { jsonOk, withAuth } from '@/server/api/handler'
import { getResult } from '@/server/services/results.service'

/** One student's result, with the subject breakdown as it was calculated. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getResult(ctx, params.id!)))

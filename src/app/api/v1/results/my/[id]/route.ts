import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyPublishedResult } from '@/server/services/results.service'

/**
 * One of the signed-in student's own results.
 *
 * A result belonging to somebody else is reported as not found rather than as
 * forbidden: a 403 would confirm the id exists.
 */
export const GET = withAuth(async ({ ctx, params }) =>
  jsonOk(await getMyPublishedResult(ctx, params.id!)),
)

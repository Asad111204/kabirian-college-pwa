import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyPublishedResults } from '@/server/services/results.service'

/**
 * The signed-in student's own published results.
 *
 * There is no `studentId` parameter, here or in the service beneath it — whose
 * results these are comes from the session cookie and from nowhere else, so
 * `?studentId=` has nothing to attach itself to.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getMyPublishedResults(ctx)))

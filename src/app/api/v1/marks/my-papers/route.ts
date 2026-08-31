import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyExamPapers } from '@/server/services/marks.service'

/**
 * The papers the signed-in teacher may mark.
 *
 * There is no parameter for whose list it is: the staff record comes from the
 * session, so a teacher cannot ask for somebody else's.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getMyExamPapers(ctx)))

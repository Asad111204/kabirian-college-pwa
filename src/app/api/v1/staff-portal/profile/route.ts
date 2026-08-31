import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyProfile } from '@/server/services/staff-portal.service'

/** The teacher's own record — their own details, so nothing is withheld. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getMyProfile(ctx)))

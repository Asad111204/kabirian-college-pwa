import { jsonOk, withAuth } from '@/server/api/handler'
import { setCurrentAcademicSession } from '@/server/services/academic-structure.service'

/** Makes one session the current one. Exactly one session can be current. */
export const POST = withAuth(async ({ ctx, params }) =>
  jsonOk(await setCurrentAcademicSession(ctx, params.id!)),
)

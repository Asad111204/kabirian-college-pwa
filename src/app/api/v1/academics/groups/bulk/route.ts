import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createAcademicGroupsBulk } from '@/server/services/academic-structure.service'
import { academicGroupBulkSchema } from '@/validation/academics'

/**
 * Creates many groups at once — this is what the Session Structure matrix uses
 * to build all 20 of Kabirian College's combinations in one click.
 * Combinations that already exist are skipped, so it is safe to re-run.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, academicGroupBulkSchema)
  return jsonOk(await createAcademicGroupsBulk(ctx, input), 201)
})

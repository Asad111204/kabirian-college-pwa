import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createSection } from '@/server/services/academic-structure.service'
import { sectionCreateSchema } from '@/validation/academics'

/**
 * Adds a section (B, C, …) to an existing group. A program is never limited to
 * one section — requirement 7.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, sectionCreateSchema)
  return jsonOk(await createSection(ctx, input), 201)
})

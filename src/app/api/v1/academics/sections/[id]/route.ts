import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { deleteSection, updateSection } from '@/server/services/academic-structure.service'
import { sectionUpdateSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, sectionUpdateSchema)
  return jsonOk(await updateSection(ctx, params.id!, input))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteSection(ctx, params.id!)
  return jsonOk({ deleted: true })
})

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteAcademicGroup,
  setAcademicGroupActive,
} from '@/server/services/academic-structure.service'
import { setActiveSchema } from '@/validation/academics'

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setAcademicGroupActive(ctx, params.id!, input.isActive))
})

/** Only when it has no enrolled students and no teacher assignments. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteAcademicGroup(ctx, params.id!)
  return jsonOk({ deleted: true })
})

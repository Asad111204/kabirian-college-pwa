import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteAcademicSession,
  updateAcademicSession,
} from '@/server/services/academic-structure.service'
import { academicSessionUpdateSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, academicSessionUpdateSchema)
  return jsonOk(await updateAcademicSession(ctx, params.id!, input))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteAcademicSession(ctx, params.id!)
  return jsonOk({ deleted: true })
})

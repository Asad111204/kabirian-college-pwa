import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteSubject,
  setSubjectActive,
  updateSubject,
} from '@/server/services/academic-blocks.service'
import { setActiveSchema, subjectUpdateSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, subjectUpdateSchema)
  return jsonOk(await updateSubject(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setSubjectActive(ctx, params.id!, input.isActive))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteSubject(ctx, params.id!)
  return jsonOk({ deleted: true })
})

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteExamType,
  setExamTypeActive,
  updateExamType,
} from '@/server/services/exams.service'
import { setActiveSchema } from '@/validation/academics'
import { examTypeUpdateSchema } from '@/validation/exams'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, examTypeUpdateSchema)
  return jsonOk(await updateExamType(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setExamTypeActive(ctx, params.id!, input.isActive))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteExamType(ctx, params.id!)
  return jsonOk({ deleted: true })
})

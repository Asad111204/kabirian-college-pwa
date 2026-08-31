import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { deleteExam, getExam, setExamStatus, updateExam } from '@/server/services/exams.service'
import { examStatusSchema, examUpdateSchema } from '@/validation/exams'

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getExam(ctx, params.id!)))

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, examUpdateSchema)
  return jsonOk(await updateExam(ctx, params.id!, input))
})

/** Cancelling an exam, or returning a cancelled one to draft. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, examStatusSchema)
  return jsonOk(await setExamStatus(ctx, params.id!, input.status))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteExam(ctx, params.id!)
  return jsonOk({ deleted: true })
})

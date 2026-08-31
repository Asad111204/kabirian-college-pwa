import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { deleteExamPaper, updateExamPaper } from '@/server/services/exams.service'
import { examPaperUpdateSchema } from '@/validation/exams'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, examPaperUpdateSchema)
  return jsonOk(await updateExamPaper(ctx, params.id!, params.paperId!, input))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteExamPaper(ctx, params.id!, params.paperId!)
  return jsonOk({ deleted: true })
})

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createExamPaper } from '@/server/services/exams.service'
import { examPaperCreateSchema } from '@/validation/exams'

export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, examPaperCreateSchema)
  return jsonOk(await createExamPaper(ctx, params.id!, input), 201)
})

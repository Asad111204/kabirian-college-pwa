import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { createExam, listExams } from '@/server/services/exams.service'
import { ValidationError } from '@/server/api/errors'
import { examCreateSchema, examListQuerySchema } from '@/validation/exams'

export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = examListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listExams(ctx, parsed.data))
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, examCreateSchema)
  return jsonOk(await createExam(ctx, input), 201)
})

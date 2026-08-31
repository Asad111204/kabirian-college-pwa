import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createExamType, listExamTypes } from '@/server/services/exams.service'
import { examTypeCreateSchema } from '@/validation/exams'

export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  return jsonOk(
    await listExamTypes(ctx, { includeInactive: params.get('includeInactive') === 'true' }),
  )
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, examTypeCreateSchema)
  return jsonOk(await createExamType(ctx, input), 201)
})

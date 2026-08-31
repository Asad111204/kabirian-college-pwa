import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getStudent, updateStudent } from '@/server/services/students.service'
import { studentUpdateSchema } from '@/validation/students'

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getStudent(ctx, params.id!)))

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentUpdateSchema)
  return jsonOk(await updateStudent(ctx, params.id!, input))
})

/**
 * There is deliberately no DELETE.
 * A student's enrollment, and later their attendance and results, must survive
 * them leaving the college — use PATCH .../status instead.
 */

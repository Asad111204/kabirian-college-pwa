import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { promoteStudent } from '@/server/services/students.service'
import { studentPromoteSchema } from '@/validation/students'

/**
 * Move a student into a LATER academic session.
 *
 * Always an explicit action — no student is ever promoted automatically just
 * because a new session was created. The previous year is closed as promoted,
 * repeated or completed, and remains readable.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentPromoteSchema)
  return jsonOk(await promoteStudent(ctx, params.id!, input))
})

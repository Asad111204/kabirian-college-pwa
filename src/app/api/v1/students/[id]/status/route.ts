import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setStudentStatus } from '@/server/services/students.service'
import { studentStatusSchema } from '@/validation/students'

/**
 * Change a student's lifecycle status (active, left, graduated…).
 * Moving away from ACTIVE also closes their current enrollment, which releases
 * their roll number — but keeps every historical record.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentStatusSchema)
  return jsonOk(await setStudentStatus(ctx, params.id!, input.status, input.reason))
})

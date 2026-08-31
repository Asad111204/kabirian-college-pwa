import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { closeAssignment } from '@/server/services/staff.service'
import { assignmentCloseSchema } from '@/validation/staff'

/**
 * Ends an assignment. The row is kept and marked closed — attendance and marks
 * recorded under it must remain attributable.
 */
export const DELETE = withAuth(async ({ request, ctx, params }) => {
  let reason: string | undefined
  try {
    const input = await parseJsonBody(request, assignmentCloseSchema)
    reason = input.reason
  } catch {
    // A reason is optional; an empty body is fine.
  }
  return jsonOk(await closeAssignment(ctx, params.id!, params.assignmentId!, reason))
})

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setStaffStatus } from '@/server/services/staff.service'
import { staffStatusSchema } from '@/validation/staff'

/**
 * Changes employment status. Anything other than Active or On leave also closes
 * their teaching assignments and in-charge roles — keeping every row as history
 * while removing their scoped access.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, staffStatusSchema)
  return jsonOk(
    await setStaffStatus(ctx, params.id!, input.employmentStatus, {
      leavingDate: input.leavingDate,
      reason: input.reason,
    }),
  )
})

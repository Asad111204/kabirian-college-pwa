import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { assignIncharge } from '@/server/services/staff.service'
import { inchargeAssignSchema } from '@/validation/staff'

/**
 * Makes this staff member the in-charge of a section. Any existing in-charge is
 * closed first, so both remain on record.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, inchargeAssignSchema)
  return jsonOk(await assignIncharge(ctx, params.id!, input), 201)
})

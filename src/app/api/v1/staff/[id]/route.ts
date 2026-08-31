import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getStaff, updateStaff } from '@/server/services/staff.service'
import { staffUpdateSchema } from '@/validation/staff'

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getStaff(ctx, params.id!)))

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, staffUpdateSchema)
  return jsonOk(await updateStaff(ctx, params.id!, input))
})

/**
 * There is deliberately no DELETE. Teaching assignments — and later attendance
 * and marks — refer to staff, so a person who leaves has their status changed.
 */

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { linkStaffAccount, unlinkStaffAccount } from '@/server/services/staff.service'
import { staffAccountSchema } from '@/validation/staff'

/** Links an existing STAFF account, or creates a new one and links it. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, staffAccountSchema)
  return jsonOk(await linkStaffAccount(ctx, params.id!, input))
})

/** Disconnects the login. The account itself is kept, not deleted. */
export const DELETE = withAuth(async ({ ctx, params }) =>
  jsonOk(await unlinkStaffAccount(ctx, params.id!)),
)

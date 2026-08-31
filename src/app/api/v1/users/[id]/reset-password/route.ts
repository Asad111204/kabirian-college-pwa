import { jsonOk, withAuth } from '@/server/api/handler'
import { resetUserPassword } from '@/server/services/users.service'

/**
 * Issue a new temporary password.
 *
 * The response carries the new password once so the administrator can hand it
 * over. Nothing about it is stored in readable form, logged, or written to the
 * audit trail — the audit entry records only that a reset happened.
 */
export const POST = withAuth(async ({ ctx, params }) =>
  jsonOk(await resetUserPassword(ctx, params.id!)),
)

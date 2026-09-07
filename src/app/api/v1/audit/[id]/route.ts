import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getAuditEntry } from '@/server/services/audit.service'
import { uuid } from '@/validation/common'

/**
 * GET /api/v1/audit/:id — one entry with the fields that changed, after
 * redaction. The raw snapshots never leave the server.
 */
export const GET = withAuth(async ({ ctx, params }) => {
  const id = uuid.safeParse(params.id)
  if (!id.success) throw new ValidationError('That is not a valid audit entry.')
  return jsonOk(await getAuditEntry(ctx, id.data))
})

import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { deleteDocument } from '@/server/services/documents.service'
import { ValidationError } from '@/server/api/errors'
import { uuid } from '@/validation/common'

/**
 * DELETE /api/v1/documents/[id]
 *
 * Removes a document. The row stays and is marked DELETED, and the file goes to
 * the Google Drive trash, where it can be recovered for 30 days. A college
 * record of what was held is not destroyed on one click.
 */
export const DELETE = withAuth(async ({ request, ctx, params }) => {
  if (!uuid.safeParse(params.id).success) throw new ValidationError('That is not a valid document.')
  await deleteDocument(ctx, params.id!, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk({ deleted: true })
})

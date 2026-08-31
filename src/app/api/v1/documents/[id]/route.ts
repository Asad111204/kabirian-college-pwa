import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { deleteDocument } from '@/server/services/documents.service'

/**
 * DELETE /api/v1/documents/[id]
 *
 * Removes a document. The row stays and is marked DELETED, and the file goes to
 * the Google Drive trash, where it can be recovered for 30 days. A college
 * record of what was held is not destroyed on one click.
 */
export const DELETE = withAuth(async ({ request, ctx, params }) => {
  await deleteDocument(ctx, params.id ?? '', {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk({ deleted: true })
})

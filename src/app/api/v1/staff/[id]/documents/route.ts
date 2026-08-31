import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { parseDocumentUpload } from '@/server/api/upload'
import { getStaffDocuments, uploadDocument } from '@/server/services/documents.service'

/**
 * GET /api/v1/staff/[id]/documents
 *
 * The document checklist for one staff member: every type the college collects,
 * and the current file for each. A staff member may read their own; everyone
 * else needs to be an administrator.
 */
export const GET = withAuth(async ({ ctx, params }) => {
  return jsonOk(await getStaffDocuments(ctx, params.id ?? ''))
})

/**
 * POST /api/v1/staff/[id]/documents — upload or replace one document.
 *
 * Sent as multipart form data with `file` and `documentTypeKey`. If a document
 * of that type already exists it is replaced, and the previous one is kept as
 * history rather than overwritten.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const upload = await parseDocumentUpload(request)

  const document = await uploadDocument(
    ctx,
    {
      ownerType: 'STAFF',
      ownerId: params.id ?? '',
      documentTypeKey: upload.documentTypeKey,
      bytes: upload.bytes,
      declaredMimeType: upload.declaredMimeType,
      originalFileName: upload.originalFileName,
    },
    { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') },
  )

  return jsonOk(document, 201)
})

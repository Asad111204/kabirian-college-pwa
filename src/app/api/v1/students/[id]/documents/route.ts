import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { parseDocumentUpload } from '@/server/api/upload'
import { getStudentDocuments, uploadDocument } from '@/server/services/documents.service'

/**
 * GET /api/v1/students/[id]/documents
 *
 * The document checklist for one student: every type the college collects, and
 * the current file for each. A teacher gets the same shape, but the sensitive
 * rows come back with canView false.
 */
export const GET = withAuth(async ({ ctx, params }) => {
  return jsonOk(await getStudentDocuments(ctx, params.id ?? ''))
})

/**
 * POST /api/v1/students/[id]/documents — upload or replace one document.
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
      ownerType: 'STUDENT',
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

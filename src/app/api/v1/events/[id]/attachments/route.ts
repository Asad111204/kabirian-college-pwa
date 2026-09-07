import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { parseDocumentUpload } from '@/server/api/upload'
import { ACCOUNT_LIMITS, assertRateLimit } from '@/server/auth/rate-limit'
import { uploadDocument } from '@/server/services/documents.service'

/**
 * POST /api/v1/events/[id]/attachments -- attach a picture or file to an event.
 *
 * Multipart, with `file` and `documentTypeKey` (EVENT_IMAGE or
 * EVENT_ATTACHMENT). Each upload is one more file; a picture becomes the
 * cover only when PUT /events/[id]/cover says so.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  // Counted before the file is read: every upload costs an attempt, accepted or not.
  assertRateLimit(`upload:user:${ctx.userId}`, ACCOUNT_LIMITS.upload)
  const upload = await parseDocumentUpload(request)
  const document = await uploadDocument(
    ctx,
    {
      ownerType: 'EVENT',
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

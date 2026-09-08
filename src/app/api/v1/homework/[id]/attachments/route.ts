import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { parseDocumentUpload } from '@/server/api/upload'
import { ACCOUNT_LIMITS, assertRateLimit } from '@/server/auth/rate-limit'
import { uploadDocument } from '@/server/services/documents.service'

/**
 * POST /api/v1/homework/[id]/attachments — attach a worksheet, reading or scan.
 *
 * Multipart, with `file` and `documentTypeKey` (HOMEWORK_ATTACHMENT). Who may
 * attach is the homework rule — the teacher assigned to the section and
 * subject, or the office — applied inside the documents service.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  // Counted before the file is read: every upload costs an attempt, accepted or not.
  assertRateLimit(`upload:user:${ctx.userId}`, ACCOUNT_LIMITS.upload)
  const upload = await parseDocumentUpload(request)
  const document = await uploadDocument(
    ctx,
    {
      ownerType: 'HOMEWORK',
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

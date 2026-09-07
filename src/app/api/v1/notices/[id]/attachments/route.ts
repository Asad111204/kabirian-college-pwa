import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { parseDocumentUpload } from '@/server/api/upload'
import { ACCOUNT_LIMITS, assertRateLimit } from '@/server/auth/rate-limit'
import { uploadDocument } from '@/server/services/documents.service'

/**
 * POST /api/v1/notices/[id]/attachments -- attach one file to a notice.
 *
 * Multipart, with `file` and `documentTypeKey` (NOTICE_ATTACHMENT). Unlike a
 * person's documents, attachments do not replace each other: each upload is
 * one more file on the notice. Viewing goes through /documents/[id]/content,
 * which lets exactly the people who see the notice see its files.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  // Counted before the file is read: every upload costs an attempt, accepted or not.
  assertRateLimit(`upload:user:${ctx.userId}`, ACCOUNT_LIMITS.upload)
  const upload = await parseDocumentUpload(request)
  const document = await uploadDocument(
    ctx,
    {
      ownerType: 'NOTICE',
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

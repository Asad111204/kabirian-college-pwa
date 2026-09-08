import { NextResponse } from 'next/server'
import { errorResponse } from '@/server/api/handler'
import { requireAuthContext } from '@/server/auth/context'
import { getPersonPhoto } from '@/server/services/documents.service'
import { THUMBNAIL_MIME } from '@/server/documents/thumbnail'

/**
 * GET /api/v1/staff/:id/photo — a staff member's photograph as a small JPEG,
 * for the office and the person themselves. Same caching as the student photo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestInfo = { method: 'GET', path: new URL(request.url).pathname }
  try {
    const ctx = await requireAuthContext()
    const { id } = await params
    const photo = await getPersonPhoto(ctx, 'STAFF', id)
    if (request.headers.get('if-none-match') === `"${photo.version}"`) return new NextResponse(null, { status: 304 })
    return new NextResponse(new Uint8Array(photo.bytes), {
      status: 200,
      headers: {
        'Content-Type': THUMBNAIL_MIME,
        'Content-Length': String(photo.bytes.byteLength),
        'Cache-Control': 'private, max-age=86400',
        ETag: `"${photo.version}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return errorResponse(error, requestInfo)
  }
}

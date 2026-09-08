import { NextResponse } from 'next/server'
import { errorResponse } from '@/server/api/handler'
import { requireAuthContext } from '@/server/auth/context'
import { getPersonPhoto } from '@/server/services/documents.service'
import { THUMBNAIL_MIME } from '@/server/documents/thumbnail'

/**
 * GET /api/v1/students/:id/photo — the student's photograph as a small JPEG,
 * for the people allowed to see their documents (the office, their teachers,
 * themselves). Cached privately by the browser; the `v` query string is the
 * photo document's id, so a replaced photo is a new URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestInfo = { method: 'GET', path: new URL(request.url).pathname }
  try {
    const ctx = await requireAuthContext()
    const { id } = await params
    const photo = await getPersonPhoto(ctx, 'STUDENT', id)
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

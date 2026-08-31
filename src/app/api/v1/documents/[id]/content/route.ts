import { Readable } from 'node:stream'
import { NextResponse, type NextRequest } from 'next/server'
import { requireAuthContext } from '@/server/auth/context'
import { errorResponse } from '@/server/api/handler'
import { getDocumentContent } from '@/server/services/documents.service'

/**
 * GET /api/v1/documents/[id]/content
 *
 * The only way to see a document's contents.
 *
 * The file is streamed through this server. The browser never learns the Google
 * Drive file id and there is no Drive URL that would work without a login —
 * every single request is authorised again here, so a link copied out of the
 * address bar and sent to someone else simply fails for them.
 *
 * `?download=1` offers the file as a download under the name the office
 * originally uploaded; without it the browser displays it inline.
 */
export async function GET(request: NextRequest, routeContext: { params: Promise<Record<string, string>> }) {
  const requestInfo = { method: 'GET', path: new URL(request.url).pathname }

  try {
    const ctx = await requireAuthContext()
    const { id } = await routeContext.params

    const file = await getDocumentContent(ctx, id ?? '')

    const asDownload = request.nextUrl.searchParams.get('download') === '1'
    // Quotes and backslashes would break out of the header value.
    const safeName = file.originalFileName.replace(/["\\]/g, '_')

    return new NextResponse(Readable.toWeb(file.stream as Readable) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.sizeBytes),
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${safeName}"`,
        /**
         * These are people's identity documents. They must not be written to a
         * shared cache, and must not linger in the browser cache after logout.
         */
        'Cache-Control': 'private, no-store, max-age=0',
        // Stop a browser from second-guessing the type we verified at upload.
        'X-Content-Type-Options': 'nosniff',
        // Belt and braces: nothing here should ever be framed or scripted.
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
      },
    })
  } catch (error) {
    return errorResponse(error, requestInfo)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getAuthContext } from '@/server/auth/context'
import { clientIp } from '@/server/api/handler'
import { completeConnection } from '@/server/services/google-drive.service'
import { settingsRedirectForError, settingsRedirectForSuccess } from '../redirect'

/**
 * GET /api/v1/settings/google/callback
 *
 * Where Google sends the browser back after the administrator approves. This
 * URL is registered in the Google Cloud console and must match
 * GOOGLE_OAUTH_REDIRECT_URI exactly, character for character.
 *
 * Three separate checks have to pass before anything is stored:
 *   1. the request carries a valid session for an administrator,
 *   2. the `state` matches the HttpOnly cookie set when Connect was clicked,
 *   3. the account that started the flow is the one finishing it.
 *
 * The `code` in the URL is single-use and short-lived, and it is exchanged
 * server-side using the client secret, which never leaves this machine.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const params = request.nextUrl.searchParams

  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.redirect(new URL('/login', origin))
    }

    const { accountEmail } = await completeConnection({
      ctx,
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      request: { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') },
    })

    return settingsRedirectForSuccess(origin, accountEmail)
  } catch (error) {
    return settingsRedirectForError(error, origin, 'callback')
  }
}

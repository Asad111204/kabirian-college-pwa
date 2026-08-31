import { NextResponse, type NextRequest } from 'next/server'
import { getAuthContext } from '@/server/auth/context'
import { beginConnection } from '@/server/services/google-drive.service'
import { settingsRedirectForError } from '../redirect'

/**
 * GET /api/v1/settings/google/connect
 *
 * Starts the Google sign-in. This is a browser navigation rather than a fetch,
 * because the administrator has to end up on Google's own consent page.
 *
 * It is a GET that changes nothing on our side except a short-lived state
 * cookie, so there is nothing here for a CSRF attack to trigger. The state
 * cookie it sets is what protects the *callback*, which is the step that
 * matters.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin

  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.redirect(new URL('/login', origin))
    }

    // Throws ForbiddenError for anyone who is not an administrator.
    const consentUrl = await beginConnection(ctx)
    return NextResponse.redirect(consentUrl)
  } catch (error) {
    return settingsRedirectForError(error, origin, 'connect')
  }
}

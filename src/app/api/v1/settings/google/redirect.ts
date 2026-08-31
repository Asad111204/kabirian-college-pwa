import 'server-only'
import { NextResponse } from 'next/server'
import { AppError } from '@/server/api/errors'
import { isProduction } from '@/server/config/env'
import { logger } from '@/server/logger'

const SETTINGS_PATH = '/admin/settings'

/**
 * Sends the administrator back to the Settings page with a message.
 *
 * The OAuth routes are browser navigations, so an error must not end as raw
 * JSON on a blank page. The message is carried in the query string and shown by
 * the Settings page.
 *
 * Only our own AppError messages are passed through: they are written for
 * users. Anything unexpected becomes a generic sentence, and the real error is
 * logged on the server, so an internal detail never reaches the address bar.
 */
export function settingsRedirectForError(error: unknown, origin: string, stage: 'connect' | 'callback'): NextResponse {
  let message: string

  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error(`Google Drive ${stage} failed`, { ...error.logContext, error })
      message = isProduction ? 'Something went wrong on our side. Please try again.' : error.message
    } else {
      if (error.status === 403) logger.warn(`Forbidden Google Drive ${stage}`, { ...error.logContext })
      message = error.message
    }
  } else {
    logger.error(`Unhandled error during Google Drive ${stage}`, { error })
    message = 'Something went wrong while talking to Google. Please try again.'
  }

  const url = new URL(SETTINGS_PATH, origin)
  url.searchParams.set('drive_error', message)
  return NextResponse.redirect(url)
}

/** Sends the administrator back to Settings with a success notice. */
export function settingsRedirectForSuccess(origin: string, accountEmail: string | null): NextResponse {
  const url = new URL(SETTINGS_PATH, origin)
  url.searchParams.set('drive_connected', accountEmail ?? '1')
  return NextResponse.redirect(url)
}

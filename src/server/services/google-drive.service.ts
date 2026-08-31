/**
 * Connecting the college's Google Drive.
 *
 * This is the only place that runs the OAuth dance. The two API routes are thin
 * wrappers around the three functions here, so the security rules live in one
 * file that can be read top to bottom.
 *
 * The dance, in order:
 *
 *   1. An administrator clicks "Connect Google Drive".
 *      `beginConnection` builds a Google consent URL and a one-time random
 *      `state` value, which is also placed in a short-lived HttpOnly cookie.
 *   2. Google shows its own sign-in and consent screen. We never see the
 *      password.
 *   3. Google sends the browser back to our callback with a `code` and the same
 *      `state`. `completeConnection` checks the state against the cookie,
 *      exchanges the code for a refresh token, encrypts it, and stores it.
 *
 * Why the state check matters: the callback is a GET, and our CSRF defence only
 * covers POST/PUT/PATCH/DELETE. Without `state`, someone could link an
 * administrator to a crafted callback URL and attach *their* Google account to
 * the college's system. The state cookie makes that impossible, because the
 * attacker cannot set or read an HttpOnly cookie on our domain.
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { authorize, type AuthContext } from '../auth/context'
import { assertAdminArea } from './service-utils'
import { writeAuditLog } from '../audit/audit'
import { AppError, ValidationError } from '../api/errors'
import { env, isProduction } from '../config/env'
import { logger } from '../logger'
import { encryptSecret, isEncryptionConfigured, safeEquals } from '../crypto/secret-box'
import { deleteSetting, readSetting, writeSetting } from '../settings/settings-store'
import {
  DRIVE_SCOPE,
  SETTING_CONNECTION,
  SETTING_REFRESH_TOKEN,
  createBareOAuthClient,
  fetchAccountInfo,
  hasOAuthCredentials,
  readConnection,
  resetDriveClientCache,
  translateDriveError,
  type DriveConnectionRecord,
} from '../storage/google-drive-client'
import { ensureRootFolders } from '../storage/google-drive.provider'

const STATE_COOKIE = 'kc_google_oauth'
const STATE_TTL_SECONDS = 600 // ten minutes is ample for a sign-in

/** What the Settings page shows. Contains no secret of any kind. */
export interface DriveStatus {
  connected: boolean
  /** True when GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI are present in .env. */
  credentialsConfigured: boolean
  /** True when APP_ENCRYPTION_KEY is a valid 32-byte key. */
  encryptionConfigured: boolean
  /** The value of STORAGE_PROVIDER in .env. */
  storageProvider: string
  redirectUri: string
  scope: string
  accountEmail: string | null
  accountName: string | null
  connectedAt: string | null
  rootFolderId: string | null
  studentsFolderId: string | null
  staffFolderId: string | null
}

/**
 * Everything the Settings page needs to describe the current state.
 * Admin-only: the redirect URI and configuration state are operational detail.
 */
export async function getDriveStatus(ctx: AuthContext): Promise<DriveStatus> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  const connection = await readConnection()
  const hasToken = (await readSetting<string>(SETTING_REFRESH_TOKEN)) !== null

  return {
    // "Connected" means we actually hold a token, not merely that a record exists.
    connected: Boolean(connection && hasToken),
    credentialsConfigured: hasOAuthCredentials(),
    encryptionConfigured: isEncryptionConfigured(),
    storageProvider: env.STORAGE_PROVIDER,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    scope: DRIVE_SCOPE,
    accountEmail: connection?.accountEmail ?? null,
    accountName: connection?.accountName ?? null,
    connectedAt: connection?.connectedAt ?? null,
    rootFolderId: connection?.rootFolderId ?? null,
    studentsFolderId: connection?.studentsFolderId ?? null,
    staffFolderId: connection?.staffFolderId ?? null,
  }
}

/**
 * Step 1: build the Google consent URL and remember the state.
 * Returns the URL the browser should be sent to.
 */
export async function beginConnection(ctx: AuthContext): Promise<string> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  if (!isEncryptionConfigured()) {
    throw new AppError(
      'APP_ENCRYPTION_KEY is not set, so the Google token could not be stored safely. ' +
        'Set it in .env and restart before connecting Drive.',
      { status: 503, code: 'NOT_CONFIGURED' },
    )
  }

  const client = createBareOAuthClient() // throws a clear error if .env is incomplete
  const state = randomBytes(32).toString('base64url')

  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, `${state}.${ctx.userId}`, {
    httpOnly: true,
    secure: isProduction,
    // Lax still sends the cookie on Google's top-level redirect back to us,
    // while blocking it on cross-site sub-requests.
    sameSite: 'lax',
    path: '/api/v1/settings/google',
    maxAge: STATE_TTL_SECONDS,
  })

  return client.generateAuthUrl({
    // offline + consent is what makes Google return a *refresh* token rather
    // than only a one-hour access token.
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    include_granted_scopes: true,
    state,
  })
}

/** Checks the state parameter against the cookie, then clears the cookie. */
async function consumeState(state: string | null, ctx: AuthContext): Promise<void> {
  const cookieStore = await cookies()
  const stored = cookieStore.get(STATE_COOKIE)?.value ?? null
  cookieStore.delete({ name: STATE_COOKIE, path: '/api/v1/settings/google' })

  if (!state || !stored) {
    throw new ValidationError(
      'This Google sign-in could not be verified, most likely because it took longer than ten minutes. Please click Connect again.',
    )
  }

  const separator = stored.lastIndexOf('.')
  const expectedState = separator === -1 ? '' : stored.slice(0, separator)
  const startedByUserId = separator === -1 ? '' : stored.slice(separator + 1)

  if (!safeEquals(state, expectedState)) {
    logger.warn('Google OAuth callback with a mismatched state parameter', { userId: ctx.userId })
    throw new ValidationError('This Google sign-in could not be verified. Please click Connect again.')
  }

  // The person who finished the flow must be the one who started it.
  if (startedByUserId !== ctx.userId) {
    logger.warn('Google OAuth callback finished by a different user than started it', {
      startedByUserId,
      finishedByUserId: ctx.userId,
    })
    throw new ValidationError('This Google sign-in was started by a different account. Please click Connect again.')
  }
}

/**
 * Step 2: exchange the code for tokens and store the refresh token, encrypted.
 * Returns a short message for the Settings page.
 */
export async function completeConnection(args: {
  ctx: AuthContext
  code: string | null
  state: string | null
  error: string | null
  request?: { ipAddress?: string | null; userAgent?: string | null }
}): Promise<{ accountEmail: string | null }> {
  const { ctx, code, state, error } = args
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  await consumeState(state, ctx)

  // The administrator pressed Cancel on Google's consent screen.
  if (error) {
    if (error === 'access_denied') {
      throw new ValidationError('Google access was declined, so Drive was not connected.')
    }
    throw new ValidationError(`Google reported a problem with the sign-in: ${error}`)
  }

  if (!code) throw new ValidationError('Google did not return an authorisation code. Please try connecting again.')

  const client = createBareOAuthClient()

  let refreshToken: string
  let grantedScope: string
  try {
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      /**
       * Google only returns a refresh token when it decides this is a fresh
       * grant. We always send prompt=consent to force one, so reaching here
       * means something unusual — most often the grant already exists and
       * Google short-circuited it.
       */
      throw new AppError(
        'Google did not return a long-lived token. Remove this app at ' +
          'https://myaccount.google.com/permissions and click Connect again.',
        { status: 502, code: 'DRIVE_NO_REFRESH_TOKEN' },
      )
    }

    refreshToken = tokens.refresh_token
    grantedScope = tokens.scope ?? DRIVE_SCOPE
    client.setCredentials(tokens)
  } catch (err) {
    throw translateDriveError(err, 'sign-in')
  }

  // Confirm the token really works, and find out which account it belongs to,
  // before we tell anyone the connection succeeded.
  const account = await fetchAccountInfo(client)

  const record: DriveConnectionRecord = {
    accountEmail: account.email,
    accountName: account.name,
    scope: grantedScope,
    connectedAt: new Date().toISOString(),
    connectedByUserId: ctx.userId,
    rootFolderId: null,
    studentsFolderId: null,
    staffFolderId: null,
  }

  await writeSetting(SETTING_REFRESH_TOKEN, encryptSecret(refreshToken, 'google.refresh_token'), ctx, {
    description: 'Encrypted Google refresh token. Never displayed or logged.',
  })
  await writeSetting(SETTING_CONNECTION, record, ctx, {
    description: 'Google Drive connection details. Contains no secret.',
  })

  resetDriveClientCache()

  /**
   * Create the college folder structure straight away, so the administrator can
   * see it in Drive and know the connection really works end to end.
   *
   * A failure here does not undo the connection — the token is valid and the
   * folders are created again on the first upload, or when "Test connection" is
   * pressed. Losing the connection over a transient Drive error would be worse.
   */
  let folders: { rootFolderId: string } | null = null
  try {
    folders = await ensureRootFolders()
    await writeAuditLog(ctx, {
      action: 'storage.folders_created',
      entityType: 'Setting',
      entityId: SETTING_CONNECTION,
      entityLabel: 'Kabirian College folders',
      after: { rootFolderId: folders.rootFolderId },
      request: args.request,
    })
  } catch (folderError) {
    logger.warn('Google Drive connected, but the college folders could not be created yet', {
      error: folderError,
    })
  }

  // The audit entry records that a connection was made and to which account.
  // It must never contain the token, the code, or the client secret.
  await writeAuditLog(ctx, {
    action: 'storage.connected',
    entityType: 'Setting',
    entityId: SETTING_CONNECTION,
    entityLabel: account.email ?? 'Google Drive',
    after: { accountEmail: account.email, scope: grantedScope },
    request: args.request,
  })

  logger.info('Google Drive connected', { accountEmail: account.email, scope: grantedScope })

  return { accountEmail: account.email }
}

/**
 * Removes the stored token.
 *
 * Deliberately does *not* touch anything in Google Drive and does not delete a
 * single document record. Disconnecting is about this application forgetting
 * its key, not about destroying the college's files.
 */
export async function disconnectDrive(
  ctx: AuthContext,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  const previous = await readConnection()

  await deleteSetting(SETTING_REFRESH_TOKEN)
  await deleteSetting(SETTING_CONNECTION)
  resetDriveClientCache()

  await writeAuditLog(ctx, {
    action: 'storage.disconnected',
    entityType: 'Setting',
    entityId: SETTING_CONNECTION,
    entityLabel: previous?.accountEmail ?? 'Google Drive',
    before: { accountEmail: previous?.accountEmail ?? null },
    request,
  })

  logger.info('Google Drive disconnected', { accountEmail: previous?.accountEmail ?? null })
}

/**
 * Makes a real call to Google and reports what came back. This is the honest
 * answer to "is it actually working?" — it is not a cached flag.
 */
export async function testDriveConnection(ctx: AuthContext): Promise<{
  ok: true
  accountEmail: string | null
  quotaUsedBytes: number | null
  quotaLimitBytes: number | null
  rootFolderId: string | null
}> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  const account = await fetchAccountInfo()

  // Doubles as the retry for folder creation: if the folders were not created
  // when Drive was connected, pressing "Test connection" creates them now.
  let rootFolderId: string | null = null
  try {
    rootFolderId = (await ensureRootFolders()).rootFolderId
  } catch (error) {
    logger.warn('Drive answered, but the college folders could not be created', { error })
  }

  return {
    ok: true,
    accountEmail: account.email,
    quotaUsedBytes: account.quotaUsedBytes,
    quotaLimitBytes: account.quotaLimitBytes,
    rootFolderId,
  }
}

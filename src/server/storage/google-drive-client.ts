/**
 * The authorised connection to Google Drive.
 *
 * Everything that talks to Google goes through this file, so there is exactly
 * one place where credentials are read, one place where the refresh token is
 * decrypted, and one place that decides what a Google error means.
 *
 * How the connection works, in plain terms:
 *
 *   - An administrator clicks "Connect" and signs in to Google once. Google
 *     hands us a *refresh token*, which we encrypt and store in the database.
 *   - The refresh token is long-lived and never leaves the server. Whenever we
 *     need to call Drive, google-auth-library swaps it for a short-lived
 *     *access token* (about an hour) automatically.
 *   - We only ever ask for the `drive.file` scope, which means this app can see
 *     and manage *only the files it created itself*. It cannot read anything
 *     else in that Google account. That is a deliberate limit, not an oversight.
 */
import 'server-only'
import { drive, type drive_v3 } from '@googleapis/drive'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env'
import { AppError, NotConfiguredError, StorageError } from '../api/errors'
import { logger } from '../logger'
import { decryptSecret, encryptSecret } from '../crypto/secret-box'
import { readSetting, writeSetting } from '../settings/settings-store'

/**
 * The only scope this application ever requests.
 *
 * `drive.file` is per-file: Google grants access to files this app creates or
 * that a user explicitly opens with it. The broad `drive` scope would give
 * access to the account's entire Drive and would require Google's verification
 * review. We do not need it and do not ask for it.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const SETTING_CONNECTION = 'google_drive.connection'
export const SETTING_REFRESH_TOKEN = 'google_drive.refresh_token'

/** What we store about the connection. Deliberately contains no secret. */
export interface DriveConnectionRecord {
  accountEmail: string | null
  accountName: string | null
  scope: string
  connectedAt: string
  connectedByUserId: string | null
  rootFolderId: string | null
  studentsFolderId: string | null
  staffFolderId: string | null
}

export class DriveNotConnectedError extends NotConfiguredError {
  constructor(message = 'Google Drive is not connected. An administrator can connect it in Settings.') {
    super(message)
  }
}

/** Google rejected our refresh token — it was revoked, or it expired. */
export class DriveReauthRequiredError extends AppError {
  constructor() {
    super(
      'Google has ended the Drive authorisation for this app. An administrator needs to reconnect it in Settings.',
      { status: 503, code: 'DRIVE_REAUTH_REQUIRED' },
    )
  }
}

/** True when the client id / secret / redirect URI are all present in .env. */
export function hasOAuthCredentials(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI)
}

function assertOAuthCredentials(): void {
  if (hasOAuthCredentials()) return
  const missing = [
    !env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',
    !env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',
    !env.GOOGLE_OAUTH_REDIRECT_URI && 'GOOGLE_OAUTH_REDIRECT_URI',
  ].filter(Boolean)
  throw new NotConfiguredError(
    `Google Drive is not configured. Missing in .env: ${missing.join(', ')}. ` +
      'See README, section "Connecting Google Drive".',
  )
}

/**
 * A client with no user credentials attached. Used to build the consent URL and
 * to exchange the authorisation code, both of which happen before we have a
 * token.
 */
export function createBareOAuthClient(): OAuth2Client {
  assertOAuthCredentials()
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  })
}

/** Reads the stored connection record, or null when Drive is not connected. */
export async function readConnection(): Promise<DriveConnectionRecord | null> {
  return readSetting<DriveConnectionRecord>(SETTING_CONNECTION)
}

/**
 * Caches the authorised client for the life of the server process. Google
 * access tokens are cached inside it, so we are not asking Google for a new one
 * on every single upload.
 */
let cachedClient: OAuth2Client | null = null

/** Drops the cached client. Called after connecting or disconnecting. */
export function resetDriveClientCache(): void {
  cachedClient = null
}

/**
 * An OAuth client loaded with the stored refresh token, ready to call Drive.
 * Throws DriveNotConnectedError when no administrator has connected Drive yet.
 */
export async function getAuthorizedClient(): Promise<OAuth2Client> {
  if (cachedClient) return cachedClient

  const stored = await readSetting<string>(SETTING_REFRESH_TOKEN)
  if (!stored) throw new DriveNotConnectedError()

  const refreshToken = decryptSecret(stored, 'google.refresh_token')
  const client = createBareOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })

  /**
   * Google occasionally issues a replacement refresh token when it refreshes.
   * If we ignored it the old one could stop working and Drive would break days
   * later for no visible reason, so we persist the replacement immediately.
   */
  client.on('tokens', (tokens) => {
    if (!tokens.refresh_token || tokens.refresh_token === refreshToken) return
    void writeSetting(
      SETTING_REFRESH_TOKEN,
      encryptSecret(tokens.refresh_token, 'google.refresh_token'),
      null,
      { description: 'Encrypted Google refresh token. Never displayed.' },
    )
      .then(() => logger.info('Google issued a replacement refresh token; stored.'))
      .catch((error: unknown) => logger.error('Could not store replacement refresh token', { error }))
  })

  cachedClient = client
  return client
}

/** A Drive API client, authorised and ready to use. */
export async function getDriveApi(): Promise<drive_v3.Drive> {
  const auth = await getAuthorizedClient()
  return drive({ version: 'v3', auth })
}

interface GoogleErrorish {
  message?: unknown
  code?: unknown
  status?: unknown
  response?: { status?: unknown; data?: unknown }
}

/**
 * Turns whatever Google threw into one of our errors.
 *
 * The important case is `invalid_grant`: it means the refresh token no longer
 * works, because it was revoked in the Google account or because it expired.
 * While the OAuth app is in "Testing" mode Google expires refresh tokens after
 * seven days. The administrator needs to reconnect, and the message says so.
 */
export function translateDriveError(error: unknown, operation: string): AppError {
  if (error instanceof AppError) return error

  const err = error as GoogleErrorish
  const message = typeof err?.message === 'string' ? err.message : ''
  const status = Number(err?.response?.status ?? err?.status ?? err?.code ?? 0)

  if (message.includes('invalid_grant') || status === 401) {
    resetDriveClientCache()
    return new DriveReauthRequiredError()
  }

  if (status === 403 && /quota|storage|limit/i.test(message)) {
    return new StorageError(
      'The Google account has run out of Drive storage, or a Google API limit was reached. ' +
        'Free the space or wait a few minutes, then try again.',
    )
  }

  if (status === 404) {
    return new StorageError(
      'The file could not be found in Google Drive. It may have been deleted or moved out of the app folder.',
    )
  }

  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return new StorageError('Google Drive is temporarily unavailable. Please try again in a moment.')
  }

  logger.error(`Google Drive ${operation} failed`, { status, googleMessage: message })
  return new StorageError(`Google Drive could not complete this ${operation}. Please try again.`)
}

/**
 * Asks Google who we are connected as and how much Drive space is left.
 *
 * This works with `drive.file` alone, so we do not request the `email` or
 * `profile` scopes merely to display an address.
 */
export async function fetchAccountInfo(client?: OAuth2Client): Promise<{
  email: string | null
  name: string | null
  quotaLimitBytes: number | null
  quotaUsedBytes: number | null
}> {
  try {
    const auth = client ?? (await getAuthorizedClient())
    const api = drive({ version: 'v3', auth })
    const { data } = await api.about.get({
      fields: 'user(emailAddress,displayName),storageQuota(limit,usage)',
    })
    const limit = data.storageQuota?.limit
    const usage = data.storageQuota?.usage
    return {
      email: data.user?.emailAddress ?? null,
      name: data.user?.displayName ?? null,
      // Unlimited accounts omit `limit` entirely.
      quotaLimitBytes: limit == null ? null : Number(limit),
      quotaUsedBytes: usage == null ? null : Number(usage),
    }
  } catch (error) {
    throw translateDriveError(error, 'account check')
  }
}

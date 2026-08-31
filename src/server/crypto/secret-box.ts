/**
 * Encrypting secrets that have to live in the database.
 *
 * Some secrets cannot be hashed. A password is only ever *compared*, so we hash
 * it and can throw the original away (see auth/password.ts). A Google refresh
 * token is different: we have to send the original back to Google every time we
 * need a new access token, so it must be recoverable. Recoverable means
 * encrypted, not hashed.
 *
 * AES-256-GCM is used because it is authenticated: decryption fails loudly if
 * the stored value was altered, rather than quietly returning wrong bytes.
 *
 * The key comes from APP_ENCRYPTION_KEY (32 bytes, base64) and never leaves the
 * server. Rotating that key makes every stored secret unreadable — which for
 * the Drive token simply means reconnecting from Settings.
 */
import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'
import { AppError, NotConfiguredError } from '../api/errors'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96 bits, the size GCM is designed for
const TAG_BYTES = 16
const VERSION = 'v1'

/**
 * A label describing what a ciphertext is for. It is mixed into the
 * authentication tag, so a value encrypted as a Drive token cannot be pasted
 * into a different setting and still decrypt.
 */
export type SecretPurpose = 'google.refresh_token'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey

  if (!env.APP_ENCRYPTION_KEY) {
    throw new NotConfiguredError(
      'APP_ENCRYPTION_KEY is not set, so secrets cannot be stored securely. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }

  const key = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64')
  if (key.length !== 32) {
    // env.ts validates this too; this is the last line of defence.
    throw new NotConfiguredError('APP_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  }

  cachedKey = key
  return key
}

/** True when a key is configured, without throwing. Used by health checks. */
export function isEncryptionConfigured(): boolean {
  return Buffer.from(env.APP_ENCRYPTION_KEY, 'base64').length === 32
}

/**
 * Encrypts a secret for storage.
 * Returns `v1.<base64 of iv + tag + ciphertext>` — one opaque string to store.
 */
export function encryptSecret(plaintext: string, purpose: SecretPurpose): string {
  if (plaintext === '') throw new AppError('Refusing to encrypt an empty secret.', { status: 500 })

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  cipher.setAAD(Buffer.from(purpose, 'utf8'))

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`
}

/**
 * Decrypts a value produced by encryptSecret.
 *
 * Throws if the key has changed, the value was tampered with, or it was
 * encrypted for a different purpose. Callers should treat a throw as "the
 * secret is gone; ask the administrator to reconnect".
 */
export function decryptSecret(stored: string, purpose: SecretPurpose): string {
  const separator = stored.indexOf('.')
  const version = separator === -1 ? '' : stored.slice(0, separator)
  if (version !== VERSION) {
    throw new AppError('Stored secret has an unrecognised format.', {
      status: 500,
      code: 'SECRET_UNREADABLE',
    })
  }

  const raw = Buffer.from(stored.slice(separator + 1), 'base64')
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new AppError('Stored secret is truncated.', { status: 500, code: 'SECRET_UNREADABLE' })
  }

  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES)

  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAAD(Buffer.from(purpose, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Never echo the underlying crypto error — it can hint at key state.
    throw new AppError(
      'A stored secret could not be decrypted. It was encrypted with a different key, or altered.',
      { status: 500, code: 'SECRET_UNREADABLE' },
    )
  }
}

/**
 * Constant-time string comparison, for values an attacker could probe by
 * timing — the OAuth `state` parameter, for instance.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

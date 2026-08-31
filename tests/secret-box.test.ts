import { beforeAll, describe, expect, it } from 'vitest'
import { createCipheriv, randomBytes } from 'node:crypto'

/**
 * Encrypting the Google refresh token.
 *
 * The key has to be in the environment before the module is imported, because
 * env.ts validates on load.
 */
const KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64')

process.env.APP_ENCRYPTION_KEY = KEY
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'

let encryptSecret: typeof import('@/server/crypto/secret-box').encryptSecret
let decryptSecret: typeof import('@/server/crypto/secret-box').decryptSecret
let safeEquals: typeof import('@/server/crypto/secret-box').safeEquals

beforeAll(async () => {
  const secretBox = await import('@/server/crypto/secret-box')
  encryptSecret = secretBox.encryptSecret
  decryptSecret = secretBox.decryptSecret
  safeEquals = secretBox.safeEquals
})

const TOKEN = '1//0eXaMpLe-refresh-token-value-that-is-fairly-long'

describe('encrypting a secret for the database', () => {
  it('comes back out exactly as it went in', () => {
    const stored = encryptSecret(TOKEN, 'google.refresh_token')
    expect(decryptSecret(stored, 'google.refresh_token')).toBe(TOKEN)
  })

  it('never stores the secret in a readable form', () => {
    const stored = encryptSecret(TOKEN, 'google.refresh_token')
    expect(stored).not.toContain(TOKEN)
    expect(stored).not.toContain('refresh-token-value')
    expect(stored.startsWith('v1.')).toBe(true)
  })

  it('produces a different ciphertext every time, so equal tokens are not detectable', () => {
    const a = encryptSecret(TOKEN, 'google.refresh_token')
    const b = encryptSecret(TOKEN, 'google.refresh_token')
    expect(a).not.toBe(b)
    expect(decryptSecret(a, 'google.refresh_token')).toBe(decryptSecret(b, 'google.refresh_token'))
  })

  it('refuses to encrypt an empty value', () => {
    expect(() => encryptSecret('', 'google.refresh_token')).toThrow()
  })
})

describe('detecting a stored secret that cannot be trusted', () => {
  it('refuses a value whose ciphertext was altered', () => {
    const stored = encryptSecret(TOKEN, 'google.refresh_token')
    const raw = Buffer.from(stored.slice(3), 'base64')
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff
    const tampered = `v1.${raw.toString('base64')}`

    expect(() => decryptSecret(tampered, 'google.refresh_token')).toThrow(/could not be decrypted/)
  })

  it('refuses a value with an unknown format', () => {
    expect(() => decryptSecret('v2.abcdef', 'google.refresh_token')).toThrow(/unrecognised format/)
    expect(() => decryptSecret('not-encrypted-at-all', 'google.refresh_token')).toThrow()
  })

  it('refuses a truncated value', () => {
    expect(() => decryptSecret('v1.AAAA', 'google.refresh_token')).toThrow(/truncated/)
  })

  it('never leaks the plaintext in the error message', () => {
    try {
      decryptSecret('v1.AAAA', 'google.refresh_token')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN)
    }
  })
})

describe('constant-time comparison, used for the OAuth state', () => {
  it('matches identical strings', () => {
    expect(safeEquals('abc123', 'abc123')).toBe(true)
  })

  it('rejects different strings, including different lengths', () => {
    expect(safeEquals('abc123', 'abc124')).toBe(false)
    expect(safeEquals('abc', 'abcdef')).toBe(false)
    expect(safeEquals('', 'x')).toBe(false)
  })
})

describe('a value this server cannot legitimately have produced', () => {
  /** Builds a ciphertext in our storage format using an arbitrary key and label. */
  function encryptWith(key: Buffer, purpose: string, plaintext: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(purpose, 'utf8'))
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`
  }

  it('rejects a value encrypted with a different key, rather than returning wrong bytes', () => {
    const stored = encryptWith(Buffer.from(OTHER_KEY, 'base64'), 'google.refresh_token', TOKEN)
    expect(() => decryptSecret(stored, 'google.refresh_token')).toThrow(/could not be decrypted/)
  })

  it('rejects a value encrypted for a different purpose, even with the right key', () => {
    // Domain separation: a ciphertext cannot be moved between settings.
    const stored = encryptWith(Buffer.from(KEY, 'base64'), 'some.other.secret', TOKEN)
    expect(() => decryptSecret(stored, 'google.refresh_token')).toThrow(/could not be decrypted/)
  })
})

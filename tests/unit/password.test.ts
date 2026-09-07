import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, hashPassword, verifyPassword } from '@/server/auth/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

/** Argon2id through the real native library — a hash that verifies, and never the plain text. */
describe('passwords', () => {
  it('hashes with Argon2id, verifies the right password and refuses the wrong one', async () => {
    const stored = await hashPassword('Harness-Passw0rd!')
    expect(stored.startsWith('$argon2id$')).toBe(true)
    expect(stored).not.toContain('Harness-Passw0rd!')
    expect(await verifyPassword(stored, 'Harness-Passw0rd!')).toBe(true)
    expect(await verifyPassword(stored, 'harness-passw0rd!')).toBe(false)
  })

  it('never produces the same hash twice for the same password (a fresh salt each time)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('treats a corrupt stored hash as a wrong password, not a crash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
  })

  it('generates temporary passwords that meet the policy and differ every time', () => {
    const a = generateTemporaryPassword()
    const b = generateTemporaryPassword()
    expect(a.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
    expect(a).not.toBe(b)
  })
})

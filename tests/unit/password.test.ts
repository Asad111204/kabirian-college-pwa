import { describe, expect, it } from 'vitest'
import { TEMPORARY_PASSWORD, hashPassword, newTemporaryPassword, verifyPassword } from '@/server/auth/password'
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

  it('gives every new account the one temporary password the college chose', () => {
    // Deliberately the same every time. The college asked for one password to
    // hand out rather than a hundred and ninety slips, knowing it is not a
    // secret: what protects an account is being made to change it at first
    // sign-in, which is asserted where accounts are created.
    expect(newTemporaryPassword()).toBe(TEMPORARY_PASSWORD)
    expect(newTemporaryPassword()).toBe(newTemporaryPassword())
  })

  it('is long enough to be accepted as a password at all', () => {
    expect(TEMPORARY_PASSWORD.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
  })

  it('still hashes it rather than storing it as it is', async () => {
    const stored = await hashPassword(newTemporaryPassword())
    expect(stored).not.toContain(TEMPORARY_PASSWORD)
    expect(await verifyPassword(stored, TEMPORARY_PASSWORD)).toBe(true)
  })
})

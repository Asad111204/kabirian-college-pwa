import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema } from '@/validation/auth'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

/** The two forms everyone meets first. */
describe('loginSchema', () => {
  it('trims the username and keeps the password exactly as typed', () => {
    const parsed = loginSchema.parse({ username: '  harness.admin ', password: ' p ' })
    expect(parsed.username).toBe('harness.admin')
    expect(parsed.password).toBe(' p ')
  })

  it('asks for both fields in words', () => {
    const result = loginSchema.safeParse({ username: '', password: '' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toMatch(/Enter your username/)
    expect(JSON.stringify(result.error?.issues)).toMatch(/Enter your password/)
  })
})

describe('changePasswordSchema', () => {
  const good = 'A-Long-Enough-Passw0rd'

  it('accepts a matching new password of the required length', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: good, confirmPassword: good }).success).toBe(true)
  })

  it('refuses a short one, a mismatch, and reusing the current one — each on its own field', () => {
    const short = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' })
    expect(short.success).toBe(false)
    expect(JSON.stringify(short.error?.issues)).toMatch(new RegExp(`at least ${PASSWORD_MIN_LENGTH}`))

    const mismatch = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: good, confirmPassword: `${good}x` })
    expect(mismatch.success).toBe(false)
    expect(mismatch.error?.issues.some((i) => i.path.join('.') === 'confirmPassword')).toBe(true)

    const same = changePasswordSchema.safeParse({ currentPassword: good, newPassword: good, confirmPassword: good })
    expect(same.success).toBe(false)
    expect(same.error?.issues.some((i) => i.path.join('.') === 'newPassword')).toBe(true)
  })
})

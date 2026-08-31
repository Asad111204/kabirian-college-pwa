import { describe, expect, it } from 'vitest'
import { checkPasswordPolicy, PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

describe('password policy', () => {
  it('accepts a reasonable password', () => {
    expect(checkPasswordPolicy('Kabirian2026Xy', 'admin').ok).toBe(true)
  })

  it('rejects passwords that are too short', () => {
    const result = checkPasswordPolicy('Ab1', 'admin')
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain(String(PASSWORD_MIN_LENGTH))
  })

  it('requires a letter and a number', () => {
    expect(checkPasswordPolicy('1234567890').ok).toBe(false)
    expect(checkPasswordPolicy('abcdefghijk').ok).toBe(false)
    expect(checkPasswordPolicy('abcdefghij1').ok).toBe(true)
  })

  it('rejects very common passwords', () => {
    expect(checkPasswordPolicy('password123').ok).toBe(false)
    expect(checkPasswordPolicy('kabiriancollege').ok).toBe(false)
  })

  it('rejects a password containing the username', () => {
    const result = checkPasswordPolicy('myteacher12345', 'teacher')
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('username')
  })

  it('is case-insensitive about the username check', () => {
    expect(checkPasswordPolicy('xxTEACHERxx99', 'teacher').ok).toBe(false)
  })

  it('ignores very short usernames to avoid false positives', () => {
    // A 2-character username would otherwise reject almost every password.
    expect(checkPasswordPolicy('Strongpass99', 'ab').ok).toBe(true)
  })
})

/**
 * Password rules — shared by the browser and the server.
 *
 * The browser uses this to show live feedback while typing; the server uses the
 * exact same function as the real check. One definition, no drift.
 *
 * (Hashing itself is server-only and lives in src/server/auth/password.ts.)
 */

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 200

/**
 * A very small list of passwords that must never be accepted. It is not a
 * substitute for a real breach-list check, but it stops the worst choices.
 */
const FORBIDDEN_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'kabirian',
  'kabiriancollege',
  'admin12345',
  'administrator',
  'letmein123',
  'welcome123',
])

export interface PasswordCheckResult {
  ok: boolean
  problems: string[]
}

export function checkPasswordPolicy(password: string, username?: string): PasswordCheckResult {
  const problems: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  }
  if (!/[a-zA-Z]/.test(password)) {
    problems.push('Include at least one letter.')
  }
  if (!/[0-9]/.test(password)) {
    problems.push('Include at least one number.')
  }
  if (FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
    problems.push('That password is too common — please choose another.')
  }
  if (username && username.length > 2 && password.toLowerCase().includes(username.toLowerCase())) {
    problems.push('The password must not contain your username.')
  }

  return { ok: problems.length === 0, problems }
}

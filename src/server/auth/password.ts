/**
 * Password hashing (server only).
 *
 * We use Argon2id — the algorithm OWASP currently recommends. A password is
 * never stored or logged in plain text; only the hash goes into the database,
 * and a hash cannot be turned back into the password.
 *
 * The password *rules* live in src/lib/password-policy.ts because the browser
 * needs them too; they are re-exported here for convenience.
 */
import 'server-only'
import { type Algorithm, hash, verify } from '@node-rs/argon2'

export {
  checkPasswordPolicy,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  type PasswordCheckResult,
} from '@/lib/password-policy'

/**
 * Algorithm.Argon2id === 2. The library declares it as an ambient const enum,
 * which TypeScript cannot inline under `isolatedModules`, so we write the value
 * and keep the type check.
 */
const ARGON2ID: Algorithm = 2

/**
 * Argon2id parameters (OWASP minimum: 19 MiB memory, 2 iterations, parallelism 1).
 * Higher memory = slower for an attacker guessing millions of passwords.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS)
}

export async function verifyPassword(storedHash: string, plainPassword: string): Promise<boolean> {
  try {
    return await verify(storedHash, plainPassword)
  } catch {
    // A malformed hash must never crash the login route.
    return false
  }
}

/**
 * The one temporary password every new account starts on.
 *
 * The college asked for this. Handing out a hundred and ninety different
 * slips is a real burden on a small office, and one password everybody knows
 * is one thing to say at assembly.
 *
 * **It is not a secret, and it is not meant to be.** Anyone who knows it can
 * sign into any account that is still on it, so the only thing standing
 * between it and a stranger is `mustChangePassword`, which forces the person
 * to set their own the first time they sign in. That protects an account
 * somebody has used; it does nothing for one nobody has touched yet. The
 * office was told this plainly before it was set.
 *
 * A password changed by its owner is a real password and never this one.
 */
export const TEMPORARY_PASSWORD = 'abcd@12345'

/**
 * The temporary password to put on a new or reset account.
 *
 * A function rather than the constant at every call site, so that the day the
 * college wants to go back to one password per person, this is the only place
 * that changes.
 */
export function newTemporaryPassword(): string {
  return TEMPORARY_PASSWORD
}

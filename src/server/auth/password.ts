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
import { randomBytes } from 'node:crypto'

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
 * Generates a readable temporary password for a new account, e.g. "Kbr-7fq2-XM4t".
 * The admin gives it to the person once; they must change it at first login.
 */
export function generateTemporaryPassword(): string {
  // Avoids characters that are easy to misread when written on paper: 0/O, 1/l/I.
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `Kbr-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

/**
 * Login sessions.
 *
 * How it works:
 *  1. On login we generate 32 random bytes — the session token.
 *  2. The token goes to the browser in an HttpOnly cookie (JavaScript on the
 *     page cannot read it, so an XSS bug cannot steal it).
 *  3. Only the SHA-256 *hash* of the token is stored in our database. If someone
 *     ever dumped the sessions table they still could not sign in as anyone.
 *  4. Every request looks the hash up, checks expiry and that the user is still
 *     active. Deactivating a user deletes their sessions — they are locked out
 *     immediately, which a stateless JWT could not do.
 */
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '../db/prisma'
import { env, isProduction } from '../config/env'

export const SESSION_COOKIE_NAME = 'kc_session'

const SESSION_MAX_AGE_MS = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
/** When less than this is left, sliding expiry extends the session. */
const RENEW_THRESHOLD_MS = SESSION_MAX_AGE_MS / 2

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  })

  return { token, expiresAt }
}

export interface SessionUser {
  sessionId: string
  userId: string
  username: string
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  status: 'ACTIVE' | 'INACTIVE'
  mustChangePassword: boolean
  isSystemOwner: boolean
  studentId: string | null
  staffId: string | null
  fullName: string
  permissionOverrides: { permissionKey: string; effect: 'GRANT' | 'REVOKE' }[]
}

/**
 * Validates a raw token and returns the signed-in user, or null.
 * Also handles sliding expiry and cleans up expired rows.
 */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token)

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          userPermissions: { select: { permissionKey: true, effect: true } },
          student: { select: { id: true, fullName: true } },
          staff: { select: { id: true, fullName: true } },
        },
      },
    },
  })

  if (!session) return null

  // Expired → delete it so the table does not grow forever.
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }

  // Deactivated account → drop every session it has.
  if (session.user.status !== 'ACTIVE') {
    await prisma.session.deleteMany({ where: { userId: session.userId } }).catch(() => undefined)
    return null
  }

  // Sliding expiry: extend a session that is being used.
  const remaining = session.expiresAt.getTime() - Date.now()
  if (remaining < RENEW_THRESHOLD_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS), lastActiveAt: new Date() },
      })
      .catch(() => undefined)
  }

  const { user } = session

  return {
    sessionId: session.id,
    userId: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    isSystemOwner: user.isSystemOwner,
    studentId: user.student?.id ?? null,
    staffId: user.staff?.id ?? null,
    // A linked profile is authoritative; users.full_name covers administrators,
    // who have no profile; the username is the last resort.
    fullName: user.student?.fullName ?? user.staff?.fullName ?? user.fullName ?? user.username,
    permissionOverrides: user.userPermissions,
  }
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined)
}

/** Signs the user out of every device. Used on password change and deactivation. */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

// --- cookie helpers ---------------------------------------------------------

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction, // over HTTPS only in production
    sameSite: 'lax', // sent on normal navigation, blocked on cross-site POSTs
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function readSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
}

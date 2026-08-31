/**
 * Authentication service — sign in, sign out, change password.
 *
 * Security decisions visible here:
 *  - the same error message for "no such user" and "wrong password", so nobody
 *    can discover which usernames exist,
 *  - a password check runs even for unknown usernames, so the response time does
 *    not reveal whether the account exists,
 *  - repeated failures lock the account for a while (stored in the database, so
 *    it survives a restart and works with more than one server),
 *  - changing a password signs out every other device.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { AppError, AuthenticationError, ValidationError } from '../api/errors'
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../auth/password'
import { createSession, invalidateAllUserSessions, invalidateSession } from '../auth/session'
import { checkRateLimit, clearRateLimit, LOGIN_LIMITS } from '../auth/rate-limit'
import { writeAuditLog } from '../audit/audit'
import type { AuthContext } from '../auth/context'
import { logger } from '../logger'
import type { UserRole } from '@/generated/prisma/enums'

/** Deliberately vague: it must not reveal whether the username exists. */
const INVALID_CREDENTIALS = 'That username or password is not correct.'

/**
 * A dummy Argon2id hash of a random value. When the username does not exist we
 * still verify against this, so wrong-username and wrong-password take a
 * similar amount of time.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$Ck0N/qtVJHQO0f5vBpuGm9HVBTC1CWuJlvpTKzYVvUw'

export interface LoginRequestInfo {
  ipAddress?: string | null
  userAgent?: string | null
}

export interface LoginResult {
  token: string
  expiresAt: Date
  user: {
    id: string
    username: string
    fullName: string
    role: UserRole
    mustChangePassword: boolean
  }
}

export async function login(
  input: { username: string; password: string },
  request: LoginRequestInfo = {},
): Promise<LoginResult> {
  const username = input.username.trim()
  const usernameKey = username.toLowerCase()
  const ip = request.ipAddress ?? 'unknown-ip'

  // 1. Rate limiting — cheap checks first, before touching the database.
  const ipLimit = checkRateLimit(`login:ip:${ip}`, LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowMs)
  if (!ipLimit.allowed) {
    throw new AppError('Too many sign-in attempts. Please wait a few minutes and try again.', {
      status: 429,
      code: 'RATE_LIMITED',
      logContext: { ip, reason: 'ip' },
    })
  }

  const userLimit = checkRateLimit(
    `login:user:${usernameKey}`,
    LOGIN_LIMITS.perUsername.limit,
    LOGIN_LIMITS.perUsername.windowMs,
  )
  if (!userLimit.allowed) {
    throw new AppError('Too many sign-in attempts for this account. Please wait a few minutes.', {
      status: 429,
      code: 'RATE_LIMITED',
      logContext: { ip, reason: 'username' },
    })
  }

  // 2. Find the user. Usernames are case-insensitive.
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    include: {
      student: { select: { id: true, fullName: true } },
      staff: { select: { id: true, fullName: true } },
    },
  })

  // 3. Unknown username: still do the work, then fail identically.
  if (!user) {
    await verifyPassword(DUMMY_HASH, input.password)
    logger.warn('Login failed: unknown username', { ip })
    throw new AuthenticationError(INVALID_CREDENTIALS)
  }

  // 4. Locked?
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    throw new AppError(
      `This account is temporarily locked after too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      { status: 423, code: 'ACCOUNT_LOCKED' },
    )
  }

  // 5. Deactivated?
  if (user.status !== 'ACTIVE') {
    logger.warn('Login attempt on inactive account', { userId: user.id, ip })
    throw new AuthenticationError(
      'This account is not active. Please contact the college administration.',
    )
  }

  // 6. Password.
  const passwordOk = await verifyPassword(user.passwordHash, input.password)

  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1
    const shouldLock = attempts >= LOGIN_LIMITS.lockoutThreshold

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOGIN_LIMITS.lockoutMinutes * 60 * 1000)
          : null,
      },
    })

    await writeAuditLog(null, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.username,
      metadata: { attempts, locked: shouldLock },
      request,
    })

    throw new AuthenticationError(INVALID_CREDENTIALS)
  }

  // 7. Success — reset counters, start a session.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  })

  clearRateLimit(`login:user:${usernameKey}`)

  const { token, expiresAt } = await createSession(user.id, request)

  await writeAuditLog(
    {
      userId: user.id,
      role: user.role,
      username: user.username,
    } as AuthContext,
    {
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.username,
      request,
    },
  )

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      // Same order as everywhere else: a linked profile is authoritative,
      // users.full_name covers administrators, username is the last resort.
      fullName: user.student?.fullName ?? user.staff?.fullName ?? user.fullName ?? user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  }
}

export async function logout(ctx: AuthContext, request: LoginRequestInfo = {}): Promise<void> {
  await invalidateSession(ctx.sessionId)
  await writeAuditLog(ctx, {
    action: 'auth.logout',
    entityType: 'user',
    entityId: ctx.userId,
    entityLabel: ctx.username,
    request,
  })
}

export async function changeOwnPassword(
  ctx: AuthContext,
  input: { currentPassword: string; newPassword: string },
  request: LoginRequestInfo = {},
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } })
  if (!user) throw new AuthenticationError()

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword)
  if (!currentOk) {
    throw new ValidationError('Your current password is not correct.', {
      currentPassword: ['Your current password is not correct.'],
    })
  }

  const policy = checkPasswordPolicy(input.newPassword, user.username)
  if (!policy.ok) {
    throw new ValidationError('That new password is not strong enough.', {
      newPassword: policy.problems,
    })
  }

  const passwordHash = await hashPassword(input.newPassword)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  })

  // Sign out everywhere else, then give this device a fresh session.
  await invalidateAllUserSessions(user.id)

  await writeAuditLog(ctx, {
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.username,
    request,
  })
}

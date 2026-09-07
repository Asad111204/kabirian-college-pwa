/**
 * Signed-in devices.
 *
 * A session row is one browser that signed in. This service lists them and
 * ends them one at a time — for the person themselves ("that is not my
 * phone") and for an administrator looking at an account. Ending a session
 * deletes its row, so the very next request from that browser is refused;
 * nothing is cached.
 *
 * The token hash is never selected here: the list shows when and from where,
 * not anything that could be used to become that session.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { NotFoundError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { describeUserAgent } from '../auth/user-agent'
import { assertAdminArea } from './service-utils'

export interface SessionRow {
  id: string
  /** "Chrome on Windows" */
  device: string
  ipAddress: string | null
  createdAt: Date
  lastActiveAt: Date
  expiresAt: Date
  /** The session the viewer is using right now. */
  isCurrent: boolean
}

const sessionSelect = {
  id: true,
  userAgent: true,
  ipAddress: true,
  createdAt: true,
  lastActiveAt: true,
  expiresAt: true,
} as const

type Row = { id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date; lastActiveAt: Date; expiresAt: Date }

function toRow(row: Row, currentSessionId: string): SessionRow {
  return {
    id: row.id,
    device: describeUserAgent(row.userAgent),
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
    isCurrent: row.id === currentSessionId,
  }
}

async function sessionsOf(userId: string, currentSessionId: string): Promise<SessionRow[]> {
  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: sessionSelect,
    orderBy: { lastActiveAt: 'desc' },
  })
  return rows.map((r) => toRow(r, currentSessionId))
}

/* -------------------------------------------------------------------------- */
/* One's own devices                                                          */
/* -------------------------------------------------------------------------- */

export async function listMySessions(ctx: AuthContext): Promise<SessionRow[]> {
  return sessionsOf(ctx.userId, ctx.sessionId)
}

/**
 * Ends one of the caller's own sessions. The id must belong to the caller:
 * a session belonging to anyone else is simply "not found".
 */
export async function revokeMySession(ctx: AuthContext, sessionId: string): Promise<{ wasCurrent: boolean }> {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId: ctx.userId }, select: sessionSelect })
  if (!session) throw new NotFoundError('session')

  await prisma.session.delete({ where: { id: session.id } })
  await writeAuditLog(ctx, {
    action: 'auth.session_revoked',
    entityType: 'user',
    entityId: ctx.userId,
    entityLabel: ctx.username,
    metadata: { device: describeUserAgent(session.userAgent), wasCurrent: session.id === ctx.sessionId },
  })
  return { wasCurrent: session.id === ctx.sessionId }
}

/** Ends every session of the caller's except the one making the request. */
export async function revokeMyOtherSessions(ctx: AuthContext): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId: ctx.userId, id: { not: ctx.sessionId } } })
  if (count > 0) {
    await writeAuditLog(ctx, {
      action: 'auth.other_sessions_revoked',
      entityType: 'user',
      entityId: ctx.userId,
      entityLabel: ctx.username,
      metadata: { sessionsRevoked: count },
    })
  }
  return count
}

/* -------------------------------------------------------------------------- */
/* An administrator looking at an account                                     */
/* -------------------------------------------------------------------------- */

async function requireUser(userId: string): Promise<{ id: string; username: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
  if (!user) throw new NotFoundError('user')
  return user
}

export async function listUserSessions(ctx: AuthContext, userId: string): Promise<SessionRow[]> {
  assertAdminArea(ctx, 'User accounts')
  authorize(ctx, 'users.view')
  await requireUser(userId)
  return sessionsOf(userId, ctx.sessionId)
}

/** Ends one session of one account, without touching the password. */
export async function revokeUserSession(ctx: AuthContext, userId: string, sessionId: string): Promise<void> {
  assertAdminArea(ctx, 'User accounts')
  authorize(ctx, 'users.manage')
  const user = await requireUser(userId)
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId }, select: sessionSelect })
  if (!session) throw new NotFoundError('session')

  await prisma.session.delete({ where: { id: session.id } })
  await writeAuditLog(ctx, {
    action: 'user.session_revoked',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.username,
    metadata: { device: describeUserAgent(session.userAgent) },
  })
}

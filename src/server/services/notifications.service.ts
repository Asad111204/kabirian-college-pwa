/**
 * Notifications (Phase 27).
 *
 * Two halves. **Writing**: every module that has something worth telling
 * somebody about calls `notify` inside its own transaction, so a notice that
 * fails to publish never leaves a notification saying it did. **Reading**: a
 * person sees their own, marks them read, and the menu learns which buttons
 * deserve a red dot.
 *
 * Recipients are worked out here, from the same facts the module already
 * used — the section a piece of homework was set for, the audience of a
 * notice — so nobody is told about something they could not open. A
 * notification is a nudge, never a way round a permission: every link it
 * carries lands on a page that checks for itself.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ForbiddenError } from '../api/errors'
import { paginate, paginatedResult, type PaginatedResult } from './service-utils'
import { logger } from '../logger'
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_LABEL,
  isInternalLink,
  totalUnread,
  type NotificationKindValue,
  type UnreadByKind,
} from '../notifications/notifications-policy'
import type { NotificationListQuery } from '@/validation/notifications'

type PrismaExecutor = Prisma.TransactionClient | typeof prisma

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface NotificationView {
  id: string
  kind: NotificationKindValue
  kindLabel: string
  title: string
  body: string | null
  link: string
  read: boolean
  createdAt: string
}

export interface NotificationSummary {
  total: number
  byKind: UnreadByKind
  /** The newest few, for the panel that drops out of the bell. */
  latest: NotificationView[]
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export interface NotifyInput {
  kind: NotificationKindValue
  title: string
  body?: string | null
  /** Where it takes the reader; always a path inside this app. */
  link: string
  entityType?: string
  entityId?: string | null
}

/**
 * Tells a set of people about something.
 *
 * Never throws into the caller: a notice that published correctly must not
 * fail because a nudge could not be written. A failure is logged and the work
 * it was announcing stands.
 *
 * `exceptUserId` leaves out the person who did it — nobody needs telling
 * about their own action.
 */
export async function notify(
  userIds: readonly (string | null | undefined)[],
  input: NotifyInput,
  options: { executor?: PrismaExecutor; exceptUserId?: string | null } = {},
): Promise<number> {
  const executor = options.executor ?? prisma
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== options.exceptUserId))]
  if (recipients.length === 0) return 0

  if (!isInternalLink(input.link)) {
    logger.error('notification link is not inside the app; refusing to write it', { kind: input.kind })
    return 0
  }

  try {
    const result = await executor.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title.slice(0, 160),
        body: input.body ? input.body.slice(0, 400) : null,
        link: input.link.slice(0, 300),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    })
    return result.count
  } catch (error) {
    logger.error('could not write notifications', { kind: input.kind, error: error instanceof Error ? error.message : 'unknown' })
    return 0
  }
}

/* -------------------------------------------------------------------------- */
/* Who to tell                                                                */
/* -------------------------------------------------------------------------- */

/** The accounts of every active student in these sections. */
export async function studentUserIdsInSections(sectionIds: readonly string[], executor: PrismaExecutor = prisma): Promise<string[]> {
  if (sectionIds.length === 0) return []
  const rows = await executor.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      userId: { not: null },
      enrollments: { some: { sectionId: { in: [...sectionIds] }, status: 'ACTIVE' } },
    },
    select: { userId: true },
  })
  return rows.map((r) => r.userId).filter((id): id is string => id !== null)
}

/** The account of one student. */
export async function studentUserId(studentId: string, executor: PrismaExecutor = prisma): Promise<string[]> {
  const row = await executor.student.findUnique({ where: { id: studentId }, select: { userId: true } })
  return row?.userId ? [row.userId] : []
}

/**
 * The office: every active administrator.
 *
 * A staff member who also holds office access is included, because they *are*
 * the office when they switch into it, and an application nobody sees is the
 * failure this whole feature exists to prevent.
 */
export async function officeUserIds(executor: PrismaExecutor = prisma): Promise<string[]> {
  const rows = await executor.user.findMany({
    where: { status: 'ACTIVE', OR: [{ role: 'ADMIN' }, { role: 'STAFF', adminAccess: true }] },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/** The accounts of every active student in these classes, for a whole year group. */
export async function studentUserIdsInClasses(classIds: readonly string[], executor: PrismaExecutor = prisma): Promise<string[]> {
  if (classIds.length === 0) return []
  const rows = await executor.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      userId: { not: null },
      enrollments: { some: { status: 'ACTIVE', section: { academicGroup: { classId: { in: [...classIds] } } } } },
    },
    select: { userId: true },
  })
  return rows.map((r) => r.userId).filter((id): id is string => id !== null)
}

/** The accounts of the teachers assigned to these sections. */
export async function teacherUserIdsForSections(sectionIds: readonly string[], executor: PrismaExecutor = prisma): Promise<string[]> {
  if (sectionIds.length === 0) return []
  const rows = await executor.teacherAssignment.findMany({
    where: { isActive: true, sectionId: { in: [...sectionIds] }, staff: { deletedAt: null, userId: { not: null } } },
    select: { staff: { select: { userId: true } } },
  })
  return rows.map((r) => r.staff.userId).filter((id): id is string => id !== null)
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

function toView(row: {
  id: string
  kind: string
  title: string
  body: string | null
  link: string
  readAt: Date | null
  createdAt: Date
}): NotificationView {
  const kind = row.kind as NotificationKindValue
  return {
    id: row.id,
    kind,
    kindLabel: NOTIFICATION_KIND_LABEL[kind],
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** What is unread, and the newest few. Read on every page load, so it is two queries. */
export async function getNotificationSummary(ctx: AuthContext): Promise<NotificationSummary> {
  const [unread, latest] = await Promise.all([
    // Counted by reading the kinds rather than with a GROUP BY. What one
    // person has not read is a handful of rows, so the tally is the same
    // work either way — and `groupBy` through the driver adapter was seen to
    // bind its parameters wrongly against this database, which turned the
    // dashboard into a 500 for anybody who had notifications waiting.
    prisma.notification.findMany({
      where: { userId: ctx.userId, readAt: null },
      select: { kind: true },
      take: 500,
    }),
    prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      take: 8,
      select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ])

  const byKind: UnreadByKind = {}
  for (const row of unread) {
    const kind = row.kind as NotificationKindValue
    byKind[kind] = (byKind[kind] ?? 0) + 1
  }

  return { total: totalUnread(byKind), byKind, latest: latest.map(toView) }
}

/** The whole list, newest first. */
export async function listNotifications(ctx: AuthContext, query: NotificationListQuery): Promise<PaginatedResult<NotificationView>> {
  const where: Prisma.NotificationWhereInput = {
    userId: ctx.userId,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.notification.count({ where }),
  ])
  return paginatedResult(rows.map(toView), total, query.page, query.pageSize)
}

/**
 * Marks one as read.
 *
 * Scoped to the reader's own rows by the where clause itself, so an id
 * belonging to somebody else simply matches nothing — there is no way to
 * learn whether it existed.
 */
export async function markNotificationRead(ctx: AuthContext, id: string): Promise<NotificationSummary> {
  await prisma.notification.updateMany({ where: { id, userId: ctx.userId, readAt: null }, data: { readAt: new Date() } })
  return getNotificationSummary(ctx)
}

/** Marks everything read, or everything in one part of the college. */
export async function markAllNotificationsRead(ctx: AuthContext, kind?: NotificationKindValue): Promise<NotificationSummary> {
  await prisma.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(kind ? { kind } : {}) },
    data: { readAt: new Date() },
  })
  return getNotificationSummary(ctx)
}

/**
 * Marks read whatever belongs to the page somebody just opened.
 *
 * This is what takes the dot off a button: opening Homework clears the
 * homework nudges, and nothing else. The path is matched against the kinds
 * whose links live under it.
 */
export async function markReadForPath(ctx: AuthContext, path: string): Promise<void> {
  const { NOTIFICATION_KIND_PATHS } = await import('../notifications/notifications-policy')
  const kinds = NOTIFICATION_KINDS.filter((kind) => NOTIFICATION_KIND_PATHS[kind].some((base) => path === base || path.startsWith(`${base}/`)))
  if (kinds.length === 0) return
  await prisma.notification
    .updateMany({ where: { userId: ctx.userId, readAt: null, kind: { in: kinds } }, data: { readAt: new Date() } })
    .catch(() => undefined)
}

/** Signed-in people only; there is nothing here that is not somebody's own. */
export function requireOwnNotifications(ctx: AuthContext | null): AuthContext {
  if (!ctx) throw new ForbiddenError('Sign in to see your notifications.')
  authorize(ctx, 'dashboard.view')
  return ctx
}

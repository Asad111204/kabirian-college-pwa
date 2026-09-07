/**
 * Events: a date, a place, a picture, and who it is for.
 *
 * Same two boundaries as notices. Managing is office work -- ADMIN plus
 * `events.manage` for every write (ADR-058). Reading is decided by who you
 * are: an event is for everyone, all students or all staff (ADR-150), so the
 * reader's role is the whole question, and there is no parameter for it.
 *
 * A cancelled event is still shown to its audience, marked cancelled; the
 * point of cancelling is that people find out. A draft is the office's alone.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { NotFoundError, ValidationError } from '../api/errors'
import { logger } from '../logger'
import { getStorageProvider } from '../storage/provider'
import { collegeLocalToInstant, instantToCollegeLocal } from '../time/college-date'
import { decideEventVisible, type PopulationAudience } from '../notices/notice-policy'
import { assertAdminArea, paginate, paginatedResult, type PaginatedResult } from './service-utils'
import type { EventFeedQuery, EventInput, EventListQuery, EventStatusValue } from '@/validation/notices'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface EventAttachmentView {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  /** True for a picture, so the UI can show it rather than list it. */
  isImage: boolean
  uploadedAt: string
}

export interface EventRow {
  id: string
  title: string
  startsAt: string
  startsAtLocal: string
  endsAt: string | null
  endsAtLocal: string | null
  location: string | null
  audience: PopulationAudience
  status: EventStatusValue
  /** The document id of the cover picture, to be fetched through /documents/[id]/content. */
  coverDocumentId: string | null
  attachmentCount: number
  updatedAt: string
}

export interface EventDetail extends EventRow {
  description: string | null
  attachments: EventAttachmentView[]
  createdByName: string | null
}

/** What a reader sees. Status is included because CANCELLED is shown as such. */
export interface FeedEvent {
  id: string
  title: string
  description: string | null
  startsAt: string
  startsAtLocal: string
  endsAt: string | null
  endsAtLocal: string | null
  location: string | null
  audience: PopulationAudience
  status: EventStatusValue
  coverDocumentId: string | null
  attachments: EventAttachmentView[]
}

/* -------------------------------------------------------------------------- */
/* Includes and mappers                                                       */
/* -------------------------------------------------------------------------- */

const ATTACHMENTS = {
  where: { status: 'ACTIVE' as const },
  orderBy: { createdAt: 'asc' as const },
  select: { id: true, originalFileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
} as const

type EventWithAll = Prisma.EventGetPayload<{ include: { attachments: typeof ATTACHMENTS } }>

const toAttachment = (a: {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  createdAt: Date
}): EventAttachmentView => ({
  id: a.id,
  originalFileName: a.originalFileName,
  mimeType: a.mimeType,
  fileSizeBytes: a.fileSizeBytes,
  isImage: a.mimeType.startsWith('image/'),
  uploadedAt: a.createdAt.toISOString(),
})

/** The enum is wider than an event may use; the CHECK keeps rows honest. */
const asPopulation = (audience: string): PopulationAudience =>
  audience === 'STUDENTS' || audience === 'STAFF' ? audience : 'ALL'

function toRow(e: EventWithAll): EventRow {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    startsAtLocal: instantToCollegeLocal(e.startsAt),
    endsAt: e.endsAt?.toISOString() ?? null,
    endsAtLocal: e.endsAt ? instantToCollegeLocal(e.endsAt) : null,
    location: e.location,
    audience: asPopulation(e.audience),
    status: e.status,
    coverDocumentId: e.coverDocumentId,
    attachmentCount: e.attachments.length,
    updatedAt: e.updatedAt.toISOString(),
  }
}

function toDetail(e: EventWithAll, createdByName: string | null): EventDetail {
  return { ...toRow(e), description: e.description, attachments: e.attachments.map(toAttachment), createdByName }
}

function toFeed(e: EventWithAll): FeedEvent {
  const row = toRow(e)
  return {
    id: row.id,
    title: row.title,
    description: e.description,
    startsAt: row.startsAt,
    startsAtLocal: row.startsAtLocal,
    endsAt: row.endsAt,
    endsAtLocal: row.endsAtLocal,
    location: row.location,
    audience: row.audience,
    status: row.status,
    coverDocumentId: row.coverDocumentId,
    attachments: e.attachments.map(toAttachment),
  }
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

function requireEventAdmin(ctx: AuthContext, permission: 'events.view' | 'events.manage'): void {
  assertAdminArea(ctx, 'Event management')
  authorize(ctx, permission)
}

async function loadEvent(id: string): Promise<EventWithAll> {
  const event = await prisma.event.findUnique({ where: { id }, include: { attachments: ATTACHMENTS } })
  if (!event) throw new NotFoundError('event')
  return event
}

async function createdByName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } })
  return user?.fullName ?? user?.username ?? null
}

/* -------------------------------------------------------------------------- */
/* The office                                                                 */
/* -------------------------------------------------------------------------- */

export async function listEvents(ctx: AuthContext, query: EventListQuery): Promise<PaginatedResult<EventRow>> {
  requireEventAdmin(ctx, 'events.view')
  const now = new Date()

  const where: Prisma.EventWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
    ...(query.upcoming ? { OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }] } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: query.upcoming ? 'asc' : 'desc' }],
      include: { attachments: ATTACHMENTS },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.event.count({ where }),
  ])

  return paginatedResult(rows.map(toRow), total, query.page, query.pageSize)
}

export async function getEvent(ctx: AuthContext, id: string): Promise<EventDetail> {
  requireEventAdmin(ctx, 'events.view')
  const event = await loadEvent(id)
  return toDetail(event, await createdByName(event.createdByUserId))
}

export async function createEvent(ctx: AuthContext, input: EventInput): Promise<EventDetail> {
  requireEventAdmin(ctx, 'events.manage')

  const created = await prisma.event.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      startsAt: collegeLocalToInstant(input.startsAt),
      endsAt: input.endsAt ? collegeLocalToInstant(input.endsAt) : null,
      location: input.location ?? null,
      audience: input.audience,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    },
    include: { attachments: ATTACHMENTS },
  })

  const detail = toDetail(created, ctx.fullName)
  await writeAuditLog(ctx, {
    action: 'event.created',
    entityType: 'event',
    entityId: created.id,
    entityLabel: created.title,
    after: {
      title: detail.title,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      location: detail.location,
      audience: detail.audience,
      status: detail.status,
    },
  })
  return detail
}

export async function updateEvent(ctx: AuthContext, id: string, input: EventInput): Promise<EventDetail> {
  requireEventAdmin(ctx, 'events.manage')
  const existing = await loadEvent(id)
  const before = toDetail(existing, null)

  const updated = await prisma.event.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description ?? null,
      startsAt: collegeLocalToInstant(input.startsAt),
      endsAt: input.endsAt ? collegeLocalToInstant(input.endsAt) : null,
      location: input.location ?? null,
      audience: input.audience,
      updatedByUserId: ctx.userId,
    },
    include: { attachments: ATTACHMENTS },
  })
  const after = toDetail(updated, null)

  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of ['title', 'startsAt', 'endsAt', 'location', 'audience'] as const) {
    if (before[field] !== after[field]) changed[field] = { from: before[field], to: after[field] }
  }
  if ((before.description ?? '') !== (after.description ?? '')) {
    changed.description = {
      from: `${before.description?.length ?? 0} characters`,
      to: `${after.description?.length ?? 0} characters`,
    }
  }

  if (Object.keys(changed).length > 0) {
    await writeAuditLog(ctx, {
      action: 'event.updated',
      entityType: 'event',
      entityId: id,
      entityLabel: after.title,
      before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])),
      after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])),
      metadata: { changedFields: Object.keys(changed) },
    })
  }

  return { ...after, createdByName: await createdByName(updated.createdByUserId) }
}

export async function setEventStatus(ctx: AuthContext, id: string, status: EventStatusValue): Promise<EventDetail> {
  requireEventAdmin(ctx, 'events.manage')
  const existing = await loadEvent(id)
  if (existing.status === status) return toDetail(existing, await createdByName(existing.createdByUserId))

  const updated = await prisma.event.update({
    where: { id },
    data: { status, updatedByUserId: ctx.userId },
    include: { attachments: ATTACHMENTS },
  })

  await writeAuditLog(ctx, {
    action: 'event.status_changed',
    entityType: 'event',
    entityId: id,
    entityLabel: updated.title,
    before: { status: existing.status },
    after: { status: updated.status },
  })

  return toDetail(updated, await createdByName(updated.createdByUserId))
}

/**
 * Makes one of the event's own pictures its cover, or clears the cover.
 *
 * The document must already be attached to this event and be an image: the
 * cover is a pointer into the event's attachments, never a way to show a file
 * that belongs to something else.
 */
export async function setEventCover(ctx: AuthContext, id: string, documentId: string | null): Promise<EventDetail> {
  requireEventAdmin(ctx, 'events.manage')
  const existing = await loadEvent(id)

  if (documentId !== null) {
    const picture = existing.attachments.find((a) => a.id === documentId)
    if (!picture) {
      throw new ValidationError('That file is not attached to this event.', {
        coverDocumentId: ['Choose one of this event’s own pictures.'],
      })
    }
    if (!picture.mimeType.startsWith('image/')) {
      throw new ValidationError('The cover has to be a picture.', {
        coverDocumentId: ['Choose a picture, not a document.'],
      })
    }
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { coverDocumentId: documentId, updatedByUserId: ctx.userId },
    include: { attachments: ATTACHMENTS },
  })

  if (existing.coverDocumentId !== documentId) {
    await writeAuditLog(ctx, {
      action: 'event.updated',
      entityType: 'event',
      entityId: id,
      entityLabel: updated.title,
      before: { cover: existing.coverDocumentId ? 'set' : 'none' },
      after: { cover: documentId ? 'set' : 'none' },
      metadata: { changedFields: ['cover'] },
    })
  }

  return toDetail(updated, await createdByName(updated.createdByUserId))
}

/** Deletes a draft. A published event is cancelled, never deleted. */
export async function deleteEvent(ctx: AuthContext, id: string): Promise<void> {
  requireEventAdmin(ctx, 'events.manage')
  const existing = await loadEvent(id)

  if (existing.status !== 'DRAFT') {
    throw new ValidationError('An event that has been published is cancelled, not deleted.', {
      status: ['Cancel it instead.'],
    })
  }

  const files = await prisma.document.findMany({
    where: { eventId: id, status: { not: 'DELETED' } },
    select: { storageFileId: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.event.delete({ where: { id } })
    await writeAuditLog(
      ctx,
      {
        action: 'event.deleted',
        entityType: 'event',
        entityId: id,
        entityLabel: existing.title,
        before: { title: existing.title, status: existing.status, attachments: files.length },
      },
      tx,
    )
  })

  if (files.length > 0) {
    const storage = getStorageProvider()
    for (const file of files) {
      await storage.delete(file.storageFileId, 'trash').catch((error: unknown) => {
        logger.warn('Attachment of a deleted draft event could not be moved to the Drive trash', { error })
      })
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The reader                                                                 */
/* -------------------------------------------------------------------------- */

/** The policy's `decideEventVisible`, as a Prisma filter for a page of rows. */
function feedWhere(role: AuthContext['role']): Prisma.EventWhereInput {
  if (role === 'ADMIN') return {}
  const audiences: PopulationAudience[] = ['ALL', role === 'STUDENT' ? 'STUDENTS' : 'STAFF']
  return { status: { in: ['PUBLISHED', 'CANCELLED'] }, audience: { in: audiences } }
}

/** The events for the signed-in reader: upcoming first, the past on request. */
export async function getMyEventFeed(ctx: AuthContext, query: EventFeedQuery): Promise<PaginatedResult<FeedEvent>> {
  authorize(ctx, 'events.view')
  const now = new Date()

  const where: Prisma.EventWhereInput = {
    AND: [
      feedWhere(ctx.role),
      ...(query.includePast ? [] : [{ OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }] }]),
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: query.includePast ? 'desc' : 'asc' }],
      include: { attachments: ATTACHMENTS },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.event.count({ where }),
  ])

  return paginatedResult(rows.map(toFeed), total, query.page, query.pageSize)
}

/** One event, for a reader it is for. Anything else is a 404. */
export async function getMyEvent(ctx: AuthContext, id: string): Promise<FeedEvent> {
  authorize(ctx, 'events.view')
  const event = await prisma.event.findUnique({ where: { id }, include: { attachments: ATTACHMENTS } })
  if (!event) throw new NotFoundError('event')

  const decision = decideEventVisible({ status: event.status, audience: asPopulation(event.audience) }, ctx.role)
  if (!decision.visible) throw new NotFoundError('event')
  return toFeed(event)
}

/** Whether this reader may see this event -- for its pictures and files. */
export async function canViewEvent(ctx: AuthContext, eventId: string): Promise<boolean> {
  try {
    await getMyEvent(ctx, eventId)
    return true
  } catch (error) {
    if (error instanceof NotFoundError) return false
    throw error
  }
}

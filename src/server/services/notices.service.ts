/**
 * Notices: the office writes them, targets them and schedules them; everyone
 * else reads the ones that reach them.
 *
 * Two boundaries shape this file, the same two as everywhere else:
 *
 *   - **Managing is office work.** Every write requires the ADMIN role and
 *     `notices.manage` (ADR-058). A teacher cannot post to their own class from
 *     here; that is a later feature with its own rules, if the college wants it.
 *   - **Reading is decided by who you are, not what you ask for.** A reader's
 *     feed is built from their own placement (a student) or teaching scope (a
 *     teacher), resolved from the session. There is no parameter for "show me
 *     section B's notices"; the only narrowing a reader gets is by category.
 *
 * The rule itself -- which targets reach whom, and when a notice is showing --
 * is `notices/notice-policy.ts`, pure and tested. The feed query below is the
 * same rule written as SQL for the database to apply across many rows; the
 * single-notice path runs the policy function directly, and the two are
 * checked against each other in the tests.
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
import {
  decideNoticeVisible,
  type NoticeTargetFacts,
  type NoticeViewer,
  type StaffScope,
  type StudentPlacement,
} from '../notices/notice-policy'
import { getScopedSectionIds } from './staff-portal.service'
import {
  assertAdminArea,
  paginate,
  paginatedResult,
  withUniqueConstraintHandling,
  type PaginatedResult,
} from './service-utils'
import type {
  AudienceValue,
  NoticeCategoryValue,
  NoticeFeedQuery,
  NoticeInput,
  NoticeListQuery,
  NoticeTargetInput,
  PublishStatusValue,
} from '@/validation/notices'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface NoticeTargetView {
  id: string
  audience: AudienceValue
  classId: string | null
  divisionId: string | null
  programId: string | null
  academicGroupId: string | null
  sectionId: string | null
  /** "1st Year · Boys · Pre-Medical", "Section A · 1st Year · Boys · Pre-Medical", "Everyone". */
  label: string
}

export interface NoticeAttachmentView {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  uploadedAt: string
}

export interface NoticeRow {
  id: string
  title: string
  category: NoticeCategoryValue
  status: PublishStatusValue
  isPinned: boolean
  /** ISO instant. */
  publishAt: string
  /** The same moment on the college clock, for the form. */
  publishAtLocal: string
  expiresAt: string | null
  expiresAtLocal: string | null
  /** The targets in a few words: "Everyone", "1st Year, Section A · …, +2 more". */
  audienceSummary: string
  attachmentCount: number
  updatedAt: string
}

export interface NoticeDetail extends NoticeRow {
  body: string
  targets: NoticeTargetView[]
  attachments: NoticeAttachmentView[]
  createdByName: string | null
}

/** What a reader sees. No status (it is published, or they would not see it). */
export interface FeedNotice {
  id: string
  title: string
  body: string
  category: NoticeCategoryValue
  isPinned: boolean
  publishAt: string
  publishAtLocal: string
  expiresAt: string | null
  audienceSummary: string
  attachments: NoticeAttachmentView[]
}

export interface NoticeTargetOptions {
  classes: { id: string; name: string }[]
  divisions: { id: string; name: string }[]
  programs: { id: string; name: string }[]
  /** Groups and sections of the current session, labelled in full. */
  groups: { id: string; label: string }[]
  sections: { id: string; label: string }[]
  sessionName: string | null
}

/* -------------------------------------------------------------------------- */
/* Includes and mappers                                                       */
/* -------------------------------------------------------------------------- */

const GROUP_NAMES = {
  class: { select: { name: true } },
  division: { select: { name: true } },
  program: { select: { name: true } },
} as const

const TARGET_INCLUDE = {
  class: { select: { name: true } },
  division: { select: { name: true } },
  program: { select: { name: true } },
  academicGroup: { include: GROUP_NAMES },
  section: { include: { academicGroup: { include: GROUP_NAMES } } },
} as const

/** Attachments that are current. A deleted one is history and stays out. */
const ATTACHMENTS = {
  where: { status: 'ACTIVE' as const },
  orderBy: { createdAt: 'asc' as const },
  select: { id: true, originalFileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
} as const

type TargetRow = Prisma.NoticeTargetGetPayload<{ include: typeof TARGET_INCLUDE }>
type NoticeWithAll = Prisma.NoticeGetPayload<{
  include: { targets: { include: typeof TARGET_INCLUDE }; attachments: typeof ATTACHMENTS }
}>

const groupLabel = (g: { class: { name: string }; division: { name: string }; program: { name: string } }) =>
  `${g.class.name} · ${g.division.name} · ${g.program.name}`

function targetLabel(t: TargetRow): string {
  switch (t.audience) {
    case 'ALL':
      return 'Everyone'
    case 'STUDENTS':
      return 'All students'
    case 'STAFF':
      return 'All staff'
    case 'CLASS':
      return t.class?.name ?? 'A class'
    case 'DIVISION':
      return t.division?.name ?? 'A division'
    case 'PROGRAM':
      return t.program?.name ?? 'A programme'
    case 'GROUP':
      return t.academicGroup ? groupLabel(t.academicGroup) : 'A group'
    case 'SECTION':
      return t.section ? `Section ${t.section.name} · ${groupLabel(t.section.academicGroup)}` : 'A section'
  }
}

function toTargetView(t: TargetRow): NoticeTargetView {
  return {
    id: t.id,
    audience: t.audience,
    classId: t.classId,
    divisionId: t.divisionId,
    programId: t.programId,
    academicGroupId: t.academicGroupId,
    sectionId: t.sectionId,
    label: targetLabel(t),
  }
}

/** "Everyone" / "1st Year, All staff" / "Section A · …, Section B · …, +3 more". */
export function summariseAudience(labels: readonly string[]): string {
  if (labels.length === 0) return 'Nobody yet'
  const shown = labels.slice(0, 2)
  const rest = labels.length - shown.length
  return rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ')
}

const toAttachment = (a: {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  createdAt: Date
}): NoticeAttachmentView => ({
  id: a.id,
  originalFileName: a.originalFileName,
  mimeType: a.mimeType,
  fileSizeBytes: a.fileSizeBytes,
  uploadedAt: a.createdAt.toISOString(),
})

function toRow(n: NoticeWithAll): NoticeRow {
  return {
    id: n.id,
    title: n.title,
    category: n.category,
    status: n.status,
    isPinned: n.isPinned,
    publishAt: n.publishAt.toISOString(),
    publishAtLocal: instantToCollegeLocal(n.publishAt),
    expiresAt: n.expiresAt?.toISOString() ?? null,
    expiresAtLocal: n.expiresAt ? instantToCollegeLocal(n.expiresAt) : null,
    audienceSummary: summariseAudience(n.targets.map(targetLabel)),
    attachmentCount: n.attachments.length,
    updatedAt: n.updatedAt.toISOString(),
  }
}

function toDetail(n: NoticeWithAll, createdByName: string | null): NoticeDetail {
  return {
    ...toRow(n),
    body: n.body,
    targets: n.targets.map(toTargetView),
    attachments: n.attachments.map(toAttachment),
    createdByName,
  }
}

function toFeed(n: NoticeWithAll): FeedNotice {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    category: n.category,
    isPinned: n.isPinned,
    publishAt: n.publishAt.toISOString(),
    publishAtLocal: instantToCollegeLocal(n.publishAt),
    expiresAt: n.expiresAt?.toISOString() ?? null,
    audienceSummary: summariseAudience(n.targets.map(targetLabel)),
    attachments: n.attachments.map(toAttachment),
  }
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/** Every write, and the office's list, is admin-area work (ADR-058). */
function requireNoticeAdmin(ctx: AuthContext, permission: 'notices.view' | 'notices.manage'): void {
  assertAdminArea(ctx, 'Notice management')
  authorize(ctx, permission)
}

async function loadNotice(id: string): Promise<NoticeWithAll> {
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
  })
  if (!notice) throw new NotFoundError('notice')
  return notice
}

async function createdByName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, username: true },
  })
  return user?.fullName ?? user?.username ?? null
}

/**
 * The ids a target names must exist. The schema has already checked that each
 * target carries exactly the id its audience needs; this checks the id is a
 * real class, division, programme, group or section, so a stale option in a
 * form becomes a sentence rather than a foreign-key error.
 */
async function assertTargetsExist(targets: readonly NoticeTargetInput[]): Promise<void> {
  const ids = (key: keyof NoticeTargetInput) =>
    [...new Set(targets.map((t) => t[key]).filter((v): v is string => typeof v === 'string'))]

  const [classes, divisions, programs, groups, sections] = await Promise.all([
    prisma.class.count({ where: { id: { in: ids('classId') } } }),
    prisma.division.count({ where: { id: { in: ids('divisionId') } } }),
    prisma.program.count({ where: { id: { in: ids('programId') } } }),
    prisma.academicGroup.count({ where: { id: { in: ids('academicGroupId') } } }),
    prisma.section.count({ where: { id: { in: ids('sectionId') } } }),
  ])

  const missing =
    classes !== ids('classId').length ||
    divisions !== ids('divisionId').length ||
    programs !== ids('programId').length ||
    groups !== ids('academicGroupId').length ||
    sections !== ids('sectionId').length

  if (missing) {
    throw new ValidationError('One of the audiences no longer exists. Choose it again.', {
      targets: ['One of the audiences no longer exists. Choose it again.'],
    })
  }
}

const toTargetData = (t: NoticeTargetInput) => ({
  audience: t.audience,
  classId: t.classId ?? null,
  divisionId: t.divisionId ?? null,
  programId: t.programId ?? null,
  academicGroupId: t.academicGroupId ?? null,
  sectionId: t.sectionId ?? null,
})

const TARGET_CONFLICTS = { notice_targets: 'The same audience is listed twice.' }

/* -------------------------------------------------------------------------- */
/* The office                                                                 */
/* -------------------------------------------------------------------------- */

export async function listNotices(
  ctx: AuthContext,
  query: NoticeListQuery,
): Promise<PaginatedResult<NoticeRow>> {
  requireNoticeAdmin(ctx, 'notices.view')

  const where: Prisma.NoticeWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }, { createdAt: 'desc' }],
      include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.notice.count({ where }),
  ])

  return paginatedResult(rows.map(toRow), total, query.page, query.pageSize)
}

export async function getNotice(ctx: AuthContext, id: string): Promise<NoticeDetail> {
  requireNoticeAdmin(ctx, 'notices.view')
  const notice = await loadNotice(id)
  return toDetail(notice, await createdByName(notice.createdByUserId))
}

/** What the office may aim a notice at. */
export async function getNoticeTargetOptions(ctx: AuthContext): Promise<NoticeTargetOptions> {
  requireNoticeAdmin(ctx, 'notices.view')

  const session = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  })

  const [classes, divisions, programs, groups, sections] = await Promise.all([
    prisma.class.findMany({ where: { isActive: true }, orderBy: { level: 'asc' }, select: { id: true, name: true } }),
    prisma.division.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    session
      ? prisma.academicGroup.findMany({
          where: { academicSessionId: session.id, isActive: true },
          include: GROUP_NAMES,
          orderBy: [{ class: { level: 'asc' } }, { division: { sortOrder: 'asc' } }, { program: { sortOrder: 'asc' } }],
        })
      : Promise.resolve([]),
    session
      ? prisma.section.findMany({
          where: { academicSessionId: session.id, isActive: true },
          include: { academicGroup: { include: GROUP_NAMES } },
          orderBy: [
            { academicGroup: { class: { level: 'asc' } } },
            { academicGroup: { division: { sortOrder: 'asc' } } },
            { academicGroup: { program: { sortOrder: 'asc' } } },
            { name: 'asc' },
          ],
        })
      : Promise.resolve([]),
  ])

  return {
    classes,
    divisions,
    programs,
    groups: groups.map((g) => ({ id: g.id, label: groupLabel(g) })),
    sections: sections.map((s) => ({ id: s.id, label: `Section ${s.name} · ${groupLabel(s.academicGroup)}` })),
    sessionName: session?.name ?? null,
  }
}

export async function createNotice(ctx: AuthContext, input: NoticeInput): Promise<NoticeDetail> {
  requireNoticeAdmin(ctx, 'notices.manage')
  await assertTargetsExist(input.targets)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.notice.create({
        data: {
          title: input.title,
          body: input.body,
          category: input.category,
          isPinned: input.isPinned,
          // Omitted means "as soon as it is published", which the column's
          // default (now) expresses exactly.
          ...(input.publishAt ? { publishAt: collegeLocalToInstant(input.publishAt) } : {}),
          expiresAt: input.expiresAt ? collegeLocalToInstant(input.expiresAt) : null,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
          targets: { create: input.targets.map(toTargetData) },
        },
        include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
      }),
    TARGET_CONFLICTS,
  )

  const detail = toDetail(created, ctx.fullName)
  await writeAuditLog(ctx, {
    action: 'notice.created',
    entityType: 'Notice',
    entityId: created.id,
    entityLabel: created.title,
    after: {
      title: detail.title,
      category: detail.category,
      status: detail.status,
      isPinned: detail.isPinned,
      publishAt: detail.publishAt,
      expiresAt: detail.expiresAt,
      audience: detail.targets.map((t) => t.label),
    },
  })
  return detail
}

/**
 * Replaces a notice's content and its whole audience.
 *
 * Targets are replaced, not merged: the form sends the full list, and what it
 * sends is what the notice is for afterwards. Omitting `publishAt` keeps the
 * existing time -- an edit to the wording should not move a scheduled notice.
 */
export async function updateNotice(ctx: AuthContext, id: string, input: NoticeInput): Promise<NoticeDetail> {
  requireNoticeAdmin(ctx, 'notices.manage')
  const existing = await loadNotice(id)
  await assertTargetsExist(input.targets)

  const before = toDetail(existing, null)

  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.noticeTarget.deleteMany({ where: { noticeId: id } })
        return tx.notice.update({
          where: { id },
          data: {
            title: input.title,
            body: input.body,
            category: input.category,
            isPinned: input.isPinned,
            ...(input.publishAt ? { publishAt: collegeLocalToInstant(input.publishAt) } : {}),
            expiresAt: input.expiresAt ? collegeLocalToInstant(input.expiresAt) : null,
            updatedByUserId: ctx.userId,
            targets: { create: input.targets.map(toTargetData) },
          },
          include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
        })
      }),
    TARGET_CONFLICTS,
  )

  const after = toDetail(updated, null)

  // Only what actually moved. The body is long; the audit records that it
  // changed, not two copies of it.
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of ['title', 'category', 'isPinned', 'publishAt', 'expiresAt'] as const) {
    if (before[field] !== after[field]) changed[field] = { from: before[field], to: after[field] }
  }
  if (before.body !== after.body) changed.body = { from: `${before.body.length} characters`, to: `${after.body.length} characters` }
  const beforeAudience = before.targets.map((t) => t.label).sort()
  const afterAudience = after.targets.map((t) => t.label).sort()
  if (JSON.stringify(beforeAudience) !== JSON.stringify(afterAudience)) {
    changed.audience = { from: beforeAudience, to: afterAudience }
  }

  if (Object.keys(changed).length > 0) {
    await writeAuditLog(ctx, {
      action: 'notice.updated',
      entityType: 'Notice',
      entityId: id,
      entityLabel: after.title,
      before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])),
      after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])),
      metadata: { changedFields: Object.keys(changed) },
    })
  }

  return { ...after, createdByName: await createdByName(updated.createdByUserId) }
}

export async function setNoticeStatus(
  ctx: AuthContext,
  id: string,
  status: PublishStatusValue,
): Promise<NoticeDetail> {
  requireNoticeAdmin(ctx, 'notices.manage')
  const existing = await loadNotice(id)

  if (existing.status === status) return toDetail(existing, await createdByName(existing.createdByUserId))

  if (status === 'PUBLISHED' && existing.targets.length === 0) {
    throw new ValidationError('Choose at least one audience before publishing.', {
      targets: ['Choose at least one audience before publishing.'],
    })
  }

  const updated = await prisma.notice.update({
    where: { id },
    data: { status, updatedByUserId: ctx.userId },
    include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
  })

  await writeAuditLog(ctx, {
    action: 'notice.status_changed',
    entityType: 'Notice',
    entityId: id,
    entityLabel: updated.title,
    before: { status: existing.status },
    after: { status: updated.status },
  })

  return toDetail(updated, await createdByName(updated.createdByUserId))
}

/**
 * Deletes a draft. A notice that has been published is archived, never
 * deleted: people may have read it, and the record of what the college said
 * stays. The draft's attachments go with it, to the Drive trash.
 */
export async function deleteNotice(ctx: AuthContext, id: string): Promise<void> {
  requireNoticeAdmin(ctx, 'notices.manage')
  const existing = await loadNotice(id)

  if (existing.status !== 'DRAFT') {
    throw new ValidationError('A notice that has been published is archived, not deleted.', {
      status: ['Archive it instead.'],
    })
  }

  const files = await prisma.document.findMany({
    where: { noticeId: id, status: { not: 'DELETED' } },
    select: { storageFileId: true },
  })

  await prisma.$transaction(async (tx) => {
    // Targets and attachment rows cascade with the notice.
    await tx.notice.delete({ where: { id } })
    await writeAuditLog(
      ctx,
      {
        action: 'notice.deleted',
        entityType: 'Notice',
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
        logger.warn('Attachment of a deleted draft could not be moved to the Drive trash', { error })
      })
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The reader                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Who is reading, in the policy's terms.
 *
 * A student's placement is their current enrollment resolved upwards; a
 * teacher's scope is their assigned sections resolved upwards. Both come from
 * the session -- there is no parameter for either -- so a reader cannot ask
 * for anybody else's feed however the request is written.
 */
export async function resolveNoticeViewer(ctx: AuthContext): Promise<NoticeViewer> {
  if (ctx.role === 'ADMIN') return { role: 'ADMIN' }

  if (ctx.role === 'STUDENT') {
    if (!ctx.studentId) return { role: 'STUDENT', placement: null }
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: ctx.studentId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      select: {
        sectionId: true,
        section: { select: { academicGroup: { select: { id: true, classId: true, divisionId: true, programId: true } } } },
      },
    })
    if (!enrollment) return { role: 'STUDENT', placement: null }
    const g = enrollment.section.academicGroup
    const placement: StudentPlacement = {
      sectionId: enrollment.sectionId,
      academicGroupId: g.id,
      classId: g.classId,
      divisionId: g.divisionId,
      programId: g.programId,
    }
    return { role: 'STUDENT', placement }
  }

  // STAFF
  if (!ctx.staffId) return { role: 'STAFF', scope: null }
  const { sectionIds } = await getScopedSectionIds(ctx.staffId)
  if (sectionIds.length === 0) return { role: 'STAFF', scope: null }
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds } },
    select: { id: true, academicGroup: { select: { id: true, classId: true, divisionId: true, programId: true } } },
  })
  const scope: StaffScope = {
    sectionIds: sections.map((s) => s.id),
    academicGroupIds: [...new Set(sections.map((s) => s.academicGroup.id))],
    classIds: [...new Set(sections.map((s) => s.academicGroup.classId))],
    divisionIds: [...new Set(sections.map((s) => s.academicGroup.divisionId))],
    programIds: [...new Set(sections.map((s) => s.academicGroup.programId))],
  }
  return { role: 'STAFF', scope }
}

/**
 * The policy's `decideNoticeVisible`, written as a Prisma filter so the
 * database can apply it across a page of rows. Kept side by side with the
 * policy on purpose: if one changes, the other must.
 */
function feedWhere(viewer: NoticeViewer, now: Date): Prisma.NoticeWhereInput {
  const window: Prisma.NoticeWhereInput = {
    status: 'PUBLISHED',
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
  if (viewer.role === 'ADMIN') return window

  const reaches: Prisma.NoticeTargetWhereInput[] = [{ audience: 'ALL' }]

  if (viewer.role === 'STUDENT') {
    reaches.push({ audience: 'STUDENTS' })
    const p = viewer.placement
    if (p) {
      reaches.push(
        { audience: 'SECTION', sectionId: p.sectionId },
        { audience: 'GROUP', academicGroupId: p.academicGroupId },
        { audience: 'CLASS', classId: p.classId },
        { audience: 'DIVISION', divisionId: p.divisionId },
        { audience: 'PROGRAM', programId: p.programId },
      )
    }
  } else {
    reaches.push({ audience: 'STAFF' })
    const s = viewer.scope
    if (s) {
      if (s.sectionIds.length) reaches.push({ audience: 'SECTION', sectionId: { in: [...s.sectionIds] } })
      if (s.academicGroupIds.length) reaches.push({ audience: 'GROUP', academicGroupId: { in: [...s.academicGroupIds] } })
      if (s.classIds.length) reaches.push({ audience: 'CLASS', classId: { in: [...s.classIds] } })
      if (s.divisionIds.length) reaches.push({ audience: 'DIVISION', divisionId: { in: [...s.divisionIds] } })
      if (s.programIds.length) reaches.push({ audience: 'PROGRAM', programId: { in: [...s.programIds] } })
    }
  }

  return { AND: [window, { targets: { some: { OR: reaches } } }] }
}

/** The notices that reach the signed-in reader, right now. */
export async function getMyNoticeFeed(
  ctx: AuthContext,
  query: NoticeFeedQuery,
): Promise<PaginatedResult<FeedNotice>> {
  authorize(ctx, 'notices.view')
  const viewer = await resolveNoticeViewer(ctx)
  const now = new Date()

  const where: Prisma.NoticeWhereInput = {
    AND: [feedWhere(viewer, now), ...(query.category ? [{ category: query.category }] : [])],
  }

  const [rows, total] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
      include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.notice.count({ where }),
  ])

  return paginatedResult(rows.map(toFeed), total, query.page, query.pageSize)
}

/**
 * One notice, for a reader it reaches. Anything else is a 404: a notice that
 * is not for you does not exist as far as you are concerned, and a draft's
 * existence is not confirmed by a 403.
 */
export async function getMyNotice(ctx: AuthContext, id: string): Promise<FeedNotice> {
  authorize(ctx, 'notices.view')
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { targets: { include: TARGET_INCLUDE }, attachments: ATTACHMENTS },
  })
  if (!notice) throw new NotFoundError('notice')

  const viewer = await resolveNoticeViewer(ctx)
  const decision = decideNoticeVisible(
    { status: notice.status, publishAt: notice.publishAt, expiresAt: notice.expiresAt, targets: notice.targets as NoticeTargetFacts[] },
    viewer,
    new Date(),
  )
  if (!decision.visible) throw new NotFoundError('notice')
  return toFeed(notice)
}

/** Whether this reader may see this notice now -- for its attachments. */
export async function canViewNotice(ctx: AuthContext, noticeId: string): Promise<boolean> {
  try {
    await getMyNotice(ctx, noticeId)
    return true
  } catch (error) {
    if (error instanceof NotFoundError) return false
    throw error
  }
}

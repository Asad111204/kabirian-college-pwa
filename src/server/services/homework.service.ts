/**
 * Homework (Phase 20).
 *
 * A teacher sets a piece of work for one section in one subject; the
 * section's students read it, so does every teacher of the section, and so
 * does the office. The files attached to it are documents with `homeworkId`
 * set, uploaded through the documents service under the same rule that
 * decides who may set the homework.
 *
 * Who may do what is decided in `homework/homework-policy.ts` from facts
 * resolved here — the ACTIVE TeacherAssignment for the section and subject,
 * the student's current section — and never from anything the browser sent.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, can, type AuthContext } from '../auth/context'
import { ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { paginate, paginatedResult, type PaginatedResult } from './service-utils'
import { getScopedSectionIds } from './staff-portal.service'
import { collegeDateToStorage, storageToCollegeDate, todayInCollegeTimezone } from '../time/college-date'
import { decideCanManageHomework, describeDue, isHomeworkVisible, type HomeworkReader } from '../homework/homework-policy'
import type { HomeworkCreateInput, HomeworkFeedQuery, HomeworkListQuery, HomeworkUpdateInput } from '@/validation/homework'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface HomeworkAttachmentView {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  uploadedAt: string
}

export interface HomeworkRow {
  id: string
  title: string
  /** YYYY-MM-DD on the college calendar, or null. */
  dueDate: string | null
  due: { label: string; tone: 'neutral' | 'warning' | 'danger' } | null
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  subjectId: string
  subjectName: string
  staffId: string
  teacherName: string
  attachmentCount: number
  createdAt: string
  /** Whether the reader may change or remove it (decided here, so the screen agrees with the API). */
  canManage: boolean
}

export interface HomeworkDetail extends HomeworkRow {
  instructions: string
  attachments: HomeworkAttachmentView[]
}

export interface HomeworkOptions {
  /** The section+subject pairs this person may set homework for, labelled in full. */
  targets: { sectionId: string; subjectId: string; label: string; sessionName: string }[]
}

const HOMEWORK_INCLUDE = {
  section: { select: { name: true, academicGroup: { select: { class: { select: { name: true, displayName: true } }, division: { select: { name: true } }, program: { select: { name: true } } } } } },
  subject: { select: { name: true } },
  staff: { select: { fullName: true } },
  _count: { select: { attachments: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.HomeworkInclude

type HomeworkWithAll = Prisma.HomeworkGetPayload<{ include: typeof HOMEWORK_INCLUDE }>

function toRow(row: HomeworkWithAll, canManage: boolean, today: string): HomeworkRow {
  const dueDate = row.dueDate ? storageToCollegeDate(row.dueDate) : null
  return {
    id: row.id,
    title: row.title,
    dueDate,
    due: describeDue(dueDate, today),
    sectionId: row.sectionId,
    sectionName: row.section.name,
    className: row.section.academicGroup.class.displayName ?? row.section.academicGroup.class.name,
    divisionName: row.section.academicGroup.division.name,
    programName: row.section.academicGroup.program.name,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    staffId: row.staffId,
    teacherName: row.staff.fullName,
    attachmentCount: row._count.attachments,
    createdAt: row.createdAt.toISOString(),
    canManage,
  }
}

async function attachmentsOf(homeworkId: string): Promise<HomeworkAttachmentView[]> {
  const rows = await prisma.document.findMany({
    where: { homeworkId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, originalFileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
  })
  return rows.map((d) => ({ id: d.id, originalFileName: d.originalFileName, mimeType: d.mimeType, fileSizeBytes: d.fileSizeBytes, uploadedAt: d.createdAt.toISOString() }))
}

/* -------------------------------------------------------------------------- */
/* Facts the policy needs                                                     */
/* -------------------------------------------------------------------------- */

async function readerOf(ctx: AuthContext): Promise<HomeworkReader> {
  if (ctx.role === 'ADMIN') return { role: 'ADMIN', placementSectionId: null, scopedSectionIds: [] }
  if (ctx.role === 'STUDENT') {
    const enrollment = ctx.studentId
      ? await prisma.studentEnrollment.findFirst({ where: { studentId: ctx.studentId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, select: { sectionId: true } })
      : null
    return { role: 'STUDENT', placementSectionId: enrollment?.sectionId ?? null, scopedSectionIds: [] }
  }
  const scope = ctx.staffId ? await getScopedSectionIds(ctx.staffId) : { sectionIds: [] }
  return { role: 'STAFF', placementSectionId: null, scopedSectionIds: scope.sectionIds }
}

async function hasActiveAssignment(ctx: AuthContext, sectionId: string, subjectId: string): Promise<boolean> {
  if (!ctx.staffId) return false
  return (await prisma.teacherAssignment.findFirst({ where: { staffId: ctx.staffId, sectionId, subjectId, isActive: true }, select: { id: true } })) !== null
}

async function canManage(ctx: AuthContext, homework: { sectionId: string; subjectId: string; staffId: string | null }): Promise<boolean> {
  const decision = decideCanManageHomework(
    { role: ctx.role, staffId: ctx.staffId, canManage: can(ctx, 'homework.manage') },
    { hasActiveAssignment: ctx.role === 'ADMIN' ? true : await hasActiveAssignment(ctx, homework.sectionId, homework.subjectId), ownerStaffId: homework.staffId },
  )
  return decision.allowed
}

async function loadHomework(id: string): Promise<HomeworkWithAll> {
  const row = await prisma.homework.findFirst({ where: { id, deletedAt: null }, include: HOMEWORK_INCLUDE })
  if (!row) throw new NotFoundError('homework')
  return row
}

/** True when this person may read the piece: the office, its section's students, its section's teachers. */
export async function canViewHomework(ctx: AuthContext, homeworkId: string): Promise<boolean> {
  if (!can(ctx, 'homework.view')) return false
  const row = await prisma.homework.findFirst({ where: { id: homeworkId, deletedAt: null }, select: { sectionId: true } })
  if (!row) return false
  return isHomeworkVisible(await readerOf(ctx), row)
}

/** Refuses unless this person may attach to, change or remove the piece. Used by the documents service too. */
export async function assertCanManageHomework(ctx: AuthContext, homeworkId: string): Promise<void> {
  const row = await prisma.homework.findFirst({ where: { id: homeworkId, deletedAt: null }, select: { sectionId: true, subjectId: true, staffId: true } })
  if (!row) throw new NotFoundError('homework')
  const decision = decideCanManageHomework(
    { role: ctx.role, staffId: ctx.staffId, canManage: can(ctx, 'homework.manage') },
    { hasActiveAssignment: ctx.role === 'ADMIN' ? true : await hasActiveAssignment(ctx, row.sectionId, row.subjectId), ownerStaffId: row.staffId },
  )
  if (!decision.allowed) throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role, code: decision.code, homeworkId })
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** The office's and a teacher's list: every piece in the sections they may see. */
export async function listHomework(ctx: AuthContext, query: HomeworkListQuery): Promise<PaginatedResult<HomeworkRow>> {
  authorize(ctx, 'homework.view')
  if (ctx.role === 'STUDENT') throw new ForbiddenError('Students read their homework on their own page.')
  const reader = await readerOf(ctx)
  const today = todayInCollegeTimezone()

  const where: Prisma.HomeworkWhereInput = {
    deletedAt: null,
    ...(reader.role === 'STAFF' ? { sectionId: { in: [...reader.scopedSectionIds] } } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.includePast ? {} : { OR: [{ dueDate: null }, { dueDate: { gte: collegeDateToStorage(today) } }] }),
  }
  const [rows, total] = await Promise.all([
    prisma.homework.findMany({ where, include: HOMEWORK_INCLUDE, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], ...paginate(query.page, query.pageSize) }),
    prisma.homework.count({ where }),
  ])
  const items = await Promise.all(rows.map(async (row) => toRow(row, await canManage(ctx, row), today)))
  return paginatedResult(items, total, query.page, query.pageSize)
}

/** One piece with its files, for anyone allowed to read it. */
export async function getHomework(ctx: AuthContext, id: string): Promise<HomeworkDetail> {
  authorize(ctx, 'homework.view')
  const row = await loadHomework(id)
  if (!isHomeworkVisible(await readerOf(ctx), row)) throw new NotFoundError('homework')
  return { ...toRow(row, await canManage(ctx, row), todayInCollegeTimezone()), instructions: row.instructions, attachments: await attachmentsOf(row.id) }
}

/** A student's feed: their own section, soonest due first. */
export async function getMyHomeworkFeed(ctx: AuthContext, query: HomeworkFeedQuery): Promise<PaginatedResult<HomeworkRow>> {
  authorize(ctx, 'homework.view')
  const reader = await readerOf(ctx)
  if (reader.role !== 'STUDENT' || !reader.placementSectionId) return paginatedResult([], 0, query.page, query.pageSize)
  const today = todayInCollegeTimezone()
  const where: Prisma.HomeworkWhereInput = {
    deletedAt: null,
    sectionId: reader.placementSectionId,
    ...(query.includePast ? {} : { OR: [{ dueDate: null }, { dueDate: { gte: collegeDateToStorage(today) } }] }),
  }
  const [rows, total] = await Promise.all([
    prisma.homework.findMany({ where, include: HOMEWORK_INCLUDE, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], ...paginate(query.page, query.pageSize) }),
    prisma.homework.count({ where }),
  ])
  return paginatedResult(rows.map((row) => toRow(row, false, today)), total, query.page, query.pageSize)
}

/** The section+subject pairs this person may set homework for: a teacher's assignments, or everything for the office. */
export async function getHomeworkOptions(ctx: AuthContext): Promise<HomeworkOptions> {
  authorize(ctx, 'homework.manage')
  const label = (s: { name: string; academicGroup: { class: { name: string; displayName: string | null }; division: { name: string }; program: { name: string } } }, subject: string) =>
    `${s.academicGroup.class.displayName ?? s.academicGroup.class.name} · ${s.academicGroup.division.name} · ${s.academicGroup.program.name} · Section ${s.name} — ${subject}`
  const sectionSelect = { name: true, academicGroup: { select: { class: { select: { name: true, displayName: true } }, division: { select: { name: true } }, program: { select: { name: true } } } } } as const

  if (ctx.role === 'STAFF') {
    if (!ctx.staffId) return { targets: [] }
    const rows = await prisma.teacherAssignment.findMany({
      where: { staffId: ctx.staffId, isActive: true, section: { isActive: true } },
      select: { sectionId: true, subjectId: true, academicSessionId: true, section: { select: sectionSelect }, subject: { select: { name: true } } },
      orderBy: [{ academicSessionId: 'desc' }, { section: { name: 'asc' } }],
    })
    const sessions = new Map(
      (await prisma.academicSession.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.academicSessionId))] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]),
    )
    return { targets: rows.map((r) => ({ sectionId: r.sectionId, subjectId: r.subjectId, label: label(r.section, r.subject.name), sessionName: sessions.get(r.academicSessionId) ?? '' })) }
  }

  // The office: every active assignment in the current session, so a piece is always set in a teacher's name.
  const session = await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } })
  if (!session) return { targets: [] }
  const rows = await prisma.teacherAssignment.findMany({
    where: { academicSessionId: session.id, isActive: true, section: { isActive: true } },
    select: { sectionId: true, subjectId: true, section: { select: sectionSelect }, subject: { select: { name: true } }, staff: { select: { fullName: true } } },
    orderBy: [{ section: { name: 'asc' } }],
  })
  return { targets: rows.map((r) => ({ sectionId: r.sectionId, subjectId: r.subjectId, label: `${label(r.section, r.subject.name)} (${r.staff.fullName})`, sessionName: session.name })) }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export async function createHomework(ctx: AuthContext, input: HomeworkCreateInput, request?: { ipAddress?: string | null; userAgent?: string | null }): Promise<HomeworkDetail> {
  const section = await prisma.section.findUnique({
    where: { id: input.sectionId },
    select: { id: true, isActive: true, academicSessionId: true, academicGroup: { select: { classId: true, programId: true, isActive: true } } },
  })
  if (!section) throw new NotFoundError('section')
  if (!section.isActive || !section.academicGroup.isActive) throw new ValidationError('That section is no longer active.')
  const inCurriculum = await prisma.curriculumSubject.findFirst({
    where: { academicSessionId: section.academicSessionId, classId: section.academicGroup.classId, programId: section.academicGroup.programId, subjectId: input.subjectId },
    select: { id: true },
  })
  if (!inCurriculum) throw new ValidationError('That subject is not part of this section’s curriculum.')

  const decision = decideCanManageHomework(
    { role: ctx.role, staffId: ctx.staffId, canManage: can(ctx, 'homework.manage') },
    { hasActiveAssignment: ctx.role === 'ADMIN' ? true : await hasActiveAssignment(ctx, input.sectionId, input.subjectId), ownerStaffId: null },
  )
  if (!decision.allowed) throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role, code: decision.code })

  // The teacher it is set in the name of: the caller, or — for the office — the section's assigned teacher.
  let staffId = ctx.staffId
  if (ctx.role === 'ADMIN') {
    const assignment = await prisma.teacherAssignment.findFirst({ where: { sectionId: input.sectionId, subjectId: input.subjectId, isActive: true }, select: { staffId: true } })
    if (!assignment) throw new ValidationError('No teacher is assigned to this subject in this section yet, so homework cannot be set in anyone’s name.')
    staffId = assignment.staffId
  }
  if (!staffId) throw new ForbiddenError('Your login is not linked to a staff record.')

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.homework.create({
      data: {
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        academicSessionId: section.academicSessionId,
        staffId,
        title: input.title,
        instructions: input.instructions,
        dueDate: input.dueDate ? collegeDateToStorage(input.dueDate) : null,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      },
      include: HOMEWORK_INCLUDE,
    })
    await writeAuditLog(ctx, { action: 'homework.created', entityType: 'homework', entityId: row.id, entityLabel: `${row.title} · ${row.subject.name} · Section ${row.section.name}`, after: { title: row.title, dueDate: input.dueDate ?? null }, request }, tx)
    return row
  })
  return { ...toRow(created, true, todayInCollegeTimezone()), instructions: created.instructions, attachments: [] }
}

export async function updateHomework(ctx: AuthContext, id: string, input: HomeworkUpdateInput, request?: { ipAddress?: string | null; userAgent?: string | null }): Promise<HomeworkDetail> {
  const before = await loadHomework(id)
  // A piece this person cannot even see is "not found", not "forbidden".
  if (!isHomeworkVisible(await readerOf(ctx), before)) throw new NotFoundError('homework')
  await assertCanManageHomework(ctx, id)
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.homework.update({
      where: { id },
      data: { title: input.title, instructions: input.instructions, dueDate: input.dueDate ? collegeDateToStorage(input.dueDate) : null, updatedByUserId: ctx.userId },
      include: HOMEWORK_INCLUDE,
    })
    await writeAuditLog(
      ctx,
      {
        action: 'homework.updated',
        entityType: 'homework',
        entityId: id,
        entityLabel: `${row.title} · ${row.subject.name} · Section ${row.section.name}`,
        before: { title: before.title, dueDate: before.dueDate ? storageToCollegeDate(before.dueDate) : null },
        after: { title: row.title, dueDate: input.dueDate ?? null },
        request,
      },
      tx,
    )
    return row
  })
  return { ...toRow(updated, true, todayInCollegeTimezone()), instructions: updated.instructions, attachments: await attachmentsOf(id) }
}

/** Removes a piece from every list. The row and its files are kept, marked, so history is not rewritten. */
export async function deleteHomework(ctx: AuthContext, id: string, request?: { ipAddress?: string | null; userAgent?: string | null }): Promise<void> {
  const row = await loadHomework(id)
  if (!isHomeworkVisible(await readerOf(ctx), row)) throw new NotFoundError('homework')
  await assertCanManageHomework(ctx, id)
  await prisma.$transaction(async (tx) => {
    await tx.homework.update({ where: { id }, data: { deletedAt: new Date(), updatedByUserId: ctx.userId } })
    await writeAuditLog(ctx, { action: 'homework.deleted', entityType: 'homework', entityId: id, entityLabel: `${row.title} · ${row.subject.name} · Section ${row.section.name}`, request }, tx)
  })
}

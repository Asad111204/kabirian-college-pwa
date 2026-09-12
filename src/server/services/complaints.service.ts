/**
 * Complaints (Phase 23).
 *
 * A student writes an application to the office; the office reads it and
 * answers. The application is never rewritten once sent — it is what the
 * student said, on the record — and everything after it is a message in the
 * exchange, from one side or the other.
 *
 * Who may do what is decided in `complaints/complaints-policy.ts` from facts
 * resolved here: who is signed in, whose application it is, what state it is
 * in. A student's identity comes from `ctx.studentId` and never from the
 * browser, so there is no id to swap for somebody else's.
 *
 * Nothing an application says reaches the audit log. A complaint may name a
 * member of staff, and the whole point of writing one is that it does not go
 * round the college; the log records that an application was written and what
 * it was about, never a word of what it said.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, can, type AuthContext } from '../auth/context'
import { ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { notify, officeUserIds, studentUserId } from './notifications.service'
import { paginate, paginatedResult, type PaginatedResult } from './service-utils'
import {
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_STATUS_TONE,
  awaitingFor,
  awaitingOfficeAfter,
  decideCanReadComplaint,
  decideCanReplyToComplaint,
  decideCanSetComplaintStatus,
  decideCanSubmitComplaint,
  decideCanWithdrawComplaint,
  isComplaintOpen,
  nextStatusesFor,
  statusAfterOfficeReply,
  waitingDays,
  type ComplaintCategoryValue,
  type ComplaintStatusValue,
  type ComplaintViewer,
} from '../complaints/complaints-policy'
import type {
  ComplaintCreateInput,
  ComplaintListQuery,
  ComplaintReplyInput,
  ComplaintStatusChangeInput,
  MyComplaintsQuery,
} from '@/validation/complaints'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface ComplaintRow {
  id: string
  subject: string
  category: ComplaintCategoryValue
  categoryLabel: string
  status: ComplaintStatusValue
  statusLabel: string
  statusTone: 'info' | 'warning' | 'success' | 'neutral'
  /** Who it is waiting on; null once it is closed. */
  awaiting: 'OFFICE' | 'STUDENT' | null
  /** Whole days since anything last happened on it. */
  waitingDays: number
  replyCount: number
  createdAt: string
  lastActivityAt: string
  /** The student who wrote it. A student only ever sees their own here. */
  studentId: string
  studentName: string
  studentCode: string
  /** Where they sit, for the office's list; null when not enrolled. */
  sectionLabel: string | null
}

export interface ComplaintMessage {
  id: string
  body: string
  byOffice: boolean
  /** "The college office" to a student; the person's name to the office. */
  authorName: string
  createdAt: string
}

export interface ComplaintDetail extends ComplaintRow {
  body: string
  messages: ComplaintMessage[]
  /** Decided here, so the screen never offers what the API would refuse. */
  canReply: boolean
  canWithdraw: boolean
  canChangeStatus: boolean
  /** Where the office may move it next; empty for a student. */
  nextStatuses: { value: ComplaintStatusValue; label: string }[]
  /** Why it cannot be written on, when it cannot. */
  closedReason: string | null
}

/* -------------------------------------------------------------------------- */
/* Facts the policy needs                                                     */
/* -------------------------------------------------------------------------- */

function viewerOf(ctx: AuthContext): ComplaintViewer {
  return {
    role: ctx.role,
    studentId: ctx.studentId ?? null,
    canRead: can(ctx, 'complaints.view'),
    canRespond: can(ctx, 'complaints.respond'),
  }
}

const COMPLAINT_INCLUDE = {
  student: {
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      enrollments: {
        where: { status: 'ACTIVE' as const },
        orderBy: { startDate: 'desc' as const },
        take: 1,
        select: {
          section: {
            select: {
              name: true,
              academicGroup: {
                select: { class: { select: { name: true, displayName: true } }, division: { select: { name: true } }, program: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  },
  replies: { orderBy: { createdAt: 'asc' as const }, select: { id: true, body: true, byOffice: true, createdAt: true, author: { select: { fullName: true, username: true } } } },
} satisfies Prisma.ComplaintInclude

type ComplaintWithAll = Prisma.ComplaintGetPayload<{ include: typeof COMPLAINT_INCLUDE }>

function sectionLabelOf(row: ComplaintWithAll): string | null {
  const section = row.student.enrollments[0]?.section
  if (!section) return null
  const group = section.academicGroup
  return `${group.class.displayName ?? group.class.name} · ${group.division.name} · ${group.program.name} · ${section.name}`
}

function toRow(row: ComplaintWithAll, now: string): ComplaintRow {
  const status = row.status as ComplaintStatusValue
  return {
    id: row.id,
    subject: row.subject,
    category: row.category as ComplaintCategoryValue,
    categoryLabel: COMPLAINT_CATEGORY_LABEL[row.category as ComplaintCategoryValue],
    status,
    statusLabel: COMPLAINT_STATUS_LABEL[status],
    statusTone: COMPLAINT_STATUS_TONE[status],
    awaiting: awaitingFor({ status, awaitingOffice: row.awaitingOffice }),
    waitingDays: waitingDays(row.lastActivityAt.toISOString(), now),
    replyCount: row.replies.length,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    studentId: row.studentId,
    studentName: row.student.fullName,
    studentCode: row.student.studentCode,
    sectionLabel: sectionLabelOf(row),
  }
}

/**
 * The office's replies reach a student as the college's answer, not as one
 * named clerk's. Inside the office the name stays, so an answer always has
 * somebody behind it.
 */
function authorNameFor(reply: ComplaintWithAll['replies'][number], studentName: string, readerIsOffice: boolean): string {
  if (!reply.byOffice) return studentName
  if (!readerIsOffice) return 'The college office'
  return reply.author?.fullName ?? reply.author?.username ?? 'The college office'
}

function toDetail(row: ComplaintWithAll, viewer: ComplaintViewer, now: string): ComplaintDetail {
  const status = row.status as ComplaintStatusValue
  const readerIsOffice = viewer.role === 'ADMIN'
  const reply = decideCanReplyToComplaint(viewer, { studentId: row.studentId, status })
  const withdraw = decideCanWithdrawComplaint(viewer, { studentId: row.studentId, status })

  return {
    ...toRow(row, now),
    body: row.body,
    messages: row.replies.map((r) => ({
      id: r.id,
      body: r.body,
      byOffice: r.byOffice,
      authorName: authorNameFor(r, row.student.fullName, readerIsOffice),
      createdAt: r.createdAt.toISOString(),
    })),
    canReply: reply.allowed,
    canWithdraw: withdraw.allowed,
    canChangeStatus: readerIsOffice && viewer.canRespond && nextStatusesFor(status).length > 0,
    nextStatuses: readerIsOffice && viewer.canRespond ? nextStatusesFor(status).map((value) => ({ value, label: COMPLAINT_STATUS_LABEL[value] })) : [],
    closedReason: isComplaintOpen(status) ? null : (reply.allowed ? null : 'reason' in reply ? reply.reason : null),
  }
}

/** Reads one application and checks the reader may see it, or says it is not there. */
async function readOrRefuse(ctx: AuthContext, id: string): Promise<{ row: ComplaintWithAll; viewer: ComplaintViewer }> {
  const viewer = viewerOf(ctx)
  const row = await prisma.complaint.findUnique({ where: { id }, include: COMPLAINT_INCLUDE })
  if (!row) throw new NotFoundError('application')

  const decision = decideCanReadComplaint(viewer, { studentId: row.studentId })
  if (!decision.allowed) {
    // A student asking after somebody else's application is told it does not
    // exist rather than that it is not theirs: the second answer confirms it.
    if (viewer.role === 'STUDENT') throw new NotFoundError('application')
    throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role })
  }
  return { row, viewer }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** The office's list, newest activity first. */
export async function listComplaints(ctx: AuthContext, query: ComplaintListQuery): Promise<PaginatedResult<ComplaintRow>> {
  if (ctx.role !== 'ADMIN') throw new ForbiddenError('Applications are read by the office.', { userId: ctx.userId, role: ctx.role })
  authorize(ctx, 'complaints.view')

  const where: Prisma.ComplaintWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.awaitingOffice ? { awaitingOffice: true, status: { in: ['SUBMITTED', 'IN_REVIEW'] } } : {}),
    ...(query.search
      ? {
          OR: [
            { subject: { contains: query.search, mode: 'insensitive' } },
            { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { student: { studentCode: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({ where, orderBy: { lastActivityAt: 'desc' }, include: COMPLAINT_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.complaint.count({ where }),
  ])

  const now = new Date().toISOString()
  return paginatedResult(rows.map((row) => toRow(row, now)), total, query.page, query.pageSize)
}

/** A student's own applications. */
export async function listMyComplaints(ctx: AuthContext, query: MyComplaintsQuery): Promise<PaginatedResult<ComplaintRow>> {
  authorize(ctx, 'dashboard.view')
  if (ctx.role !== 'STUDENT' || !ctx.studentId) {
    throw new ForbiddenError('Only a student can read their own applications.', { userId: ctx.userId, role: ctx.role })
  }

  const where: Prisma.ComplaintWhereInput = {
    studentId: ctx.studentId,
    ...(query.includeClosed ? {} : { status: { in: ['SUBMITTED', 'IN_REVIEW'] } }),
  }
  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({ where, orderBy: { lastActivityAt: 'desc' }, include: COMPLAINT_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.complaint.count({ where }),
  ])

  const now = new Date().toISOString()
  return paginatedResult(rows.map((row) => toRow(row, now)), total, query.page, query.pageSize)
}

/** One application with its exchange, for the student who wrote it or the office. */
export async function getComplaint(ctx: AuthContext, id: string): Promise<ComplaintDetail> {
  authorize(ctx, 'dashboard.view')
  const { row, viewer } = await readOrRefuse(ctx, id)
  return toDetail(row, viewer, new Date().toISOString())
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/** A student writes an application to the office. */
export async function submitComplaint(
  ctx: AuthContext,
  input: ComplaintCreateInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ComplaintDetail> {
  authorize(ctx, 'dashboard.view')
  const viewer = viewerOf(ctx)

  const openCount = ctx.studentId
    ? await prisma.complaint.count({ where: { studentId: ctx.studentId, status: { in: ['SUBMITTED', 'IN_REVIEW'] } } })
    : 0
  const decision = decideCanSubmitComplaint(viewer, openCount)
  if (!decision.allowed) {
    if (decision.code === 'TOO_MANY_OPEN') throw new ValidationError(decision.reason)
    throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role })
  }

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: ctx.studentId!, status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
    select: { academicSessionId: true },
  })

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.complaint.create({
      data: {
        studentId: ctx.studentId!,
        academicSessionId: enrollment?.academicSessionId ?? null,
        category: input.category,
        subject: input.subject,
        body: input.body,
        status: 'SUBMITTED',
        awaitingOffice: awaitingOfficeAfter('SUBMITTED'),
        lastActivityAt: new Date(),
      },
      select: { id: true },
    })

    // What it was about, never what it said.
    await writeAuditLog(
      ctx,
      {
        action: 'complaint.submitted',
        entityType: 'complaint',
        entityId: row.id,
        entityLabel: `Application · ${COMPLAINT_CATEGORY_LABEL[input.category]}`,
        metadata: { category: input.category },
        request,
      },
      tx,
    )
    return row
  })

  // The office is told, because an application nobody sees is the failure
  // this whole feature exists to prevent.
  await notify(
    await officeUserIds(),
    {
      kind: 'COMPLAINT',
      title: `New application: ${input.subject}`,
      body: `${COMPLAINT_CATEGORY_LABEL[input.category]} · from a student.`,
      link: `/admin/complaints/${created.id}`,
      entityType: 'complaint',
      entityId: created.id,
    },
    { exceptUserId: ctx.userId },
  )

  return getComplaint(ctx, created.id)
}

/** Either side adds a message to an open application. */
export async function replyToComplaint(
  ctx: AuthContext,
  id: string,
  input: ComplaintReplyInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ComplaintDetail> {
  authorize(ctx, 'dashboard.view')
  const { row, viewer } = await readOrRefuse(ctx, id)

  const decision = decideCanReplyToComplaint(viewer, { studentId: row.studentId, status: row.status as ComplaintStatusValue })
  if (!decision.allowed) {
    if (decision.code === 'ALREADY_CLOSED') throw new ValidationError(decision.reason)
    throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role })
  }

  const byOffice = viewer.role === 'ADMIN'
  const nextStatus = byOffice ? statusAfterOfficeReply(row.status as ComplaintStatusValue) : (row.status as ComplaintStatusValue)

  await prisma.$transaction(async (tx) => {
    await tx.complaintReply.create({ data: { complaintId: id, body: input.body, byOffice, authorUserId: ctx.userId } })
    await tx.complaint.update({
      where: { id },
      data: { lastActivityAt: new Date(), status: nextStatus, awaitingOffice: awaitingOfficeAfter(byOffice ? 'OFFICE_REPLIED' : 'STUDENT_REPLIED') },
    })
    await writeAuditLog(
      ctx,
      {
        action: 'complaint.replied',
        entityType: 'complaint',
        entityId: id,
        entityLabel: `Application · ${COMPLAINT_CATEGORY_LABEL[row.category as ComplaintCategoryValue]}`,
        metadata: { category: row.category, byOffice, status: nextStatus },
        request,
      },
      tx,
    )
  })

  // Whoever did not write it is told. The office hears from the student; the
  // student hears from the college.
  await notify(
    byOffice ? await studentUserId(row.studentId) : await officeUserIds(),
    {
      kind: 'COMPLAINT',
      title: byOffice ? `The office replied: ${row.subject}` : `New reply: ${row.subject}`,
      body: byOffice ? 'There is an answer on your application.' : 'A student has added to their application.',
      link: byOffice ? `/student/complaints/${id}` : `/admin/complaints/${id}`,
      entityType: 'complaint',
      entityId: id,
    },
    { exceptUserId: ctx.userId },
  )

  return getComplaint(ctx, id)
}

/** The office moves an application to another state, optionally with a closing message. */
export async function setComplaintStatus(
  ctx: AuthContext,
  id: string,
  input: ComplaintStatusChangeInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ComplaintDetail> {
  authorize(ctx, 'dashboard.view')
  const { row, viewer } = await readOrRefuse(ctx, id)

  const from = row.status as ComplaintStatusValue
  const decision = decideCanSetComplaintStatus(viewer, from, input.status)
  if (!decision.allowed) {
    if (decision.code === 'BAD_STATUS') throw new ValidationError(decision.reason, { status: [decision.reason] })
    throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role })
  }

  const closing = input.status === 'RESOLVED'
  await prisma.$transaction(async (tx) => {
    if (input.note) {
      await tx.complaintReply.create({ data: { complaintId: id, body: input.note, byOffice: true, authorUserId: ctx.userId } })
    }
    await tx.complaint.update({
      where: { id },
      data: {
        status: input.status,
        awaitingOffice: awaitingOfficeAfter(input.status === 'RESOLVED' ? 'RESOLVED' : 'REOPENED'),
        lastActivityAt: new Date(),
        closedAt: closing ? new Date() : null,
        closedByUserId: closing ? ctx.userId : null,
      },
    })
    await writeAuditLog(
      ctx,
      {
        action: 'complaint.status_changed',
        entityType: 'complaint',
        entityId: id,
        entityLabel: `Application · ${COMPLAINT_CATEGORY_LABEL[row.category as ComplaintCategoryValue]}`,
        metadata: { from, to: input.status, closingMessage: input.note ? 'yes' : 'no' },
        request,
      },
      tx,
    )
  })

  await notify(
    await studentUserId(row.studentId),
    {
      kind: 'COMPLAINT',
      title: `${COMPLAINT_STATUS_LABEL[input.status]}: ${row.subject}`,
      body: input.status === 'RESOLVED' ? 'The office has finished with your application.' : 'The office has picked your application back up.',
      link: `/student/complaints/${id}`,
      entityType: 'complaint',
      entityId: id,
    },
    { exceptUserId: ctx.userId },
  )

  return getComplaint(ctx, id)
}

/** The student takes their application back. It is kept, marked as withdrawn. */
export async function withdrawComplaint(
  ctx: AuthContext,
  id: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ComplaintDetail> {
  authorize(ctx, 'dashboard.view')
  const { row, viewer } = await readOrRefuse(ctx, id)

  const decision = decideCanWithdrawComplaint(viewer, { studentId: row.studentId, status: row.status as ComplaintStatusValue })
  if (!decision.allowed) {
    if (decision.code === 'ALREADY_CLOSED') throw new ValidationError(decision.reason)
    throw new ForbiddenError(decision.reason, { userId: ctx.userId, role: ctx.role })
  }

  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { id },
      data: { status: 'WITHDRAWN', awaitingOffice: awaitingOfficeAfter('WITHDRAWN'), lastActivityAt: new Date(), closedAt: new Date(), closedByUserId: ctx.userId },
    })
    await writeAuditLog(
      ctx,
      {
        action: 'complaint.withdrawn',
        entityType: 'complaint',
        entityId: id,
        entityLabel: `Application · ${COMPLAINT_CATEGORY_LABEL[row.category as ComplaintCategoryValue]}`,
        metadata: { category: row.category },
        request,
      },
      tx,
    )
  })

  return getComplaint(ctx, id)
}

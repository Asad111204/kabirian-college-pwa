/**
 * Audit logging.
 *
 * Every important change records who did it, what changed, and when. Services
 * call this inside the same database transaction as the change itself, so a
 * change can never exist without its audit entry.
 *
 * The audit table is append-only in practice: nothing in the application ever
 * updates or deletes rows from it.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import type { AuthContext } from '../auth/context'
import { logger } from '../logger'

/** Actions are written as `module.verb` so they group and filter cleanly. */
export type AuditAction =
  // authentication
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.password_reset'
  // academic structure
  | 'academic_session.created'
  | 'academic_session.updated'
  | 'academic_session.set_current'
  | 'class.created'
  | 'class.updated'
  | 'class.deactivated'
  | 'class.activated'
  | 'division.created'
  | 'division.updated'
  | 'division.deactivated'
  | 'division.activated'
  | 'program.created'
  | 'program.updated'
  | 'program.deactivated'
  | 'program.activated'
  | 'subject.created'
  | 'subject.updated'
  | 'subject.deactivated'
  | 'subject.activated'
  | 'academic_group.created'
  | 'academic_group.deactivated'
  | 'academic_group.activated'
  | 'section.created'
  | 'section.updated'
  | 'section.deactivated'
  | 'section.activated'
  | 'curriculum.updated'
  // users & accounts
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.activated'
  | 'user.password_reset'
  | 'user.role_changed'
  | 'user.unlocked'
  | 'user.profile_linked'
  | 'user.profile_unlinked'
  | 'user.sessions_revoked'
  // permission overrides for one user
  | 'permission.granted'
  | 'permission.revoked'
  | 'permission.override_removed'
  // students
  | 'student.created'
  | 'student.updated'
  | 'student.status_changed'
  | 'student.account_linked'
  | 'student.account_unlinked'
  // staff
  | 'staff.created'
  | 'staff.updated'
  | 'staff.status_changed'
  | 'staff.account_linked'
  | 'staff.account_unlinked'
  // teacher assignments and section in-charge
  | 'assignment.created'
  | 'assignment.closed'
  | 'incharge.assigned'
  | 'incharge.changed'
  | 'incharge.removed'
  // reference data
  | 'designation.created'
  | 'designation.updated'
  | 'designation.activated'
  | 'designation.deactivated'
  | 'department.created'
  | 'department.updated'
  | 'department.activated'
  | 'department.deactivated'
  // student enrollment
  | 'enrollment.created'
  | 'enrollment.updated'
  | 'enrollment.transferred'
  | 'enrollment.promoted'
  | 'enrollment.closed'
  // storage connection (Phase 6)
  | 'storage.connected'
  | 'storage.disconnected'
  | 'storage.folders_created'
  // documents (Phase 6)
  | 'document.uploaded'
  | 'document.replaced'
  | 'document.deleted'
  | 'document_type.created'
  | 'document_type.updated'
  | 'document_type.activated'
  | 'document_type.deactivated'
  // attendance (Phase 7)
  | 'attendance.sheet_created'
  | 'attendance.submitted'
  | 'attendance.corrected'
  | 'attendance.sheet_cancelled'
  // exams and the date sheet (Phase 8)
  | 'exam_type.created'
  | 'exam_type.updated'
  | 'exam_type.activated'
  | 'exam_type.deactivated'
  | 'exam.created'
  | 'exam.updated'
  | 'exam.status_changed'
  | 'exam.deleted'
  | 'exam_paper.created'
  | 'exam_paper.updated'
  | 'exam_paper.deleted'
  | 'date_sheet.published'
  | 'date_sheet.withdrawn'
  // marks (Phase 8)
  | 'mark_sheet.opened'
  | 'marks.entered'
  | 'marks.updated'
  | 'marks.submitted'
  | 'marks.corrected'
  // results (Phase 8)
  | 'result.generated'
  | 'result.published'
  // timetable (Phase 10)
  | 'timetable_slot.created'
  | 'timetable_slot.updated'
  | 'timetable_slot.cleared'
  | 'result.corrected'

export interface AuditInput {
  action: AuditAction
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
  /** Request details, when the call came from an HTTP request. */
  request?: { ipAddress?: string | null; userAgent?: string | null }
}

/** Anything Prisma can run queries on: the client itself or a transaction. */
type PrismaExecutor = Prisma.TransactionClient | typeof prisma

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Writes one audit entry.
 *
 * Pass the transaction client (`tx`) when the change is inside a transaction so
 * that the entry is committed or rolled back together with the change.
 */
export async function writeAuditLog(
  ctx: AuthContext | null,
  input: AuditInput,
  executor: PrismaExecutor = prisma,
): Promise<void> {
  try {
    await executor.auditLog.create({
      data: {
        actorUserId: ctx?.userId ?? null,
        actorRole: ctx?.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel?.slice(0, 200) ?? null,
        beforeData: toJson(input.before),
        afterData: toJson(input.after),
        metadata: toJson(input.metadata),
        ipAddress: input.request?.ipAddress?.slice(0, 45) ?? null,
        userAgent: input.request?.userAgent?.slice(0, 512) ?? null,
      },
    })
  } catch (error) {
    // An audit failure must not hide the underlying operation's outcome, but it
    // must be visible to operators.
    logger.error('Failed to write audit log', {
      action: input.action,
      entityType: input.entityType,
      error,
    })
    throw error
  }
}

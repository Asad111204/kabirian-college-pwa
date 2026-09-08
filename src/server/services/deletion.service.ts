/**
 * Erasing a record for good (Phase 26).
 *
 * The college asked for this and hedged it in the same breath: an
 * administrator may permanently delete a student, a member of staff or an
 * account **only when nothing references it**; where there is history the
 * delete is refused with a reason, and deactivation remains the answer.
 *
 * So this service does one thing carefully. It counts, in the database, every
 * record that points at the one being deleted, hands the counts to a pure
 * policy, and either erases or explains. **Nothing cascades**: a published
 * result card must not stop existing because somebody tidied a list, and an
 * audit entry must not lose the name of who acted because that account was
 * removed a year later.
 *
 * What does go with the record is its own placement — a student's enrolment
 * row, a teacher's assignment, a login session. Those say where somebody sat,
 * not what they did.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { assertAdminArea } from './service-utils'
import { confirmationMatches, decideCanDelete, decideCanDeleteAccount, type Blocker, type DeletionDecision } from '../admin/deletion-policy'

export interface DeletionReport {
  /** What the record is, for the sentence. */
  noun: string
  /** The name the office knows them by. */
  label: string
  /** What they must type to confirm: the student code, staff code or username. */
  confirmWith: string
  canDelete: boolean
  /** Why not, when they cannot. */
  reason: string | null
  blockers: Blocker[]
  /** What goes with the record when it is erased. */
  alsoRemoved: string[]
}

function toReport(
  noun: string,
  label: string,
  confirmWith: string,
  decision: DeletionDecision,
  alsoRemoved: string[],
): DeletionReport {
  return {
    noun,
    label,
    confirmWith,
    canDelete: decision.allowed,
    reason: decision.allowed ? null : decision.reason,
    blockers: decision.allowed ? [] : decision.blockers,
    alsoRemoved,
  }
}

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

async function studentBlockers(id: string): Promise<Blocker[]> {
  const [attendance, marks, results, documents, complaints, vouchers] = await Promise.all([
    prisma.attendanceEntry.count({ where: { studentId: id } }),
    prisma.mark.count({ where: { studentId: id } }),
    prisma.result.count({ where: { studentId: id } }),
    prisma.document.count({ where: { studentId: id } }),
    prisma.complaint.count({ where: { studentId: id } }),
    prisma.feeVoucher.count({ where: { studentId: id } }),
  ])
  return [
    { what: 'attendance marks', count: attendance },
    { what: 'exam marks', count: marks },
    { what: 'results', count: results },
    { what: 'documents', count: documents },
    { what: 'applications to the office', count: complaints },
    { what: 'fee vouchers', count: vouchers },
  ]
}

export async function getStudentDeletionReport(ctx: AuthContext, id: string): Promise<DeletionReport> {
  assertAdminArea(ctx, 'Student records')
  authorize(ctx, 'students.delete')

  const student = await prisma.student.findUnique({ where: { id }, select: { id: true, fullName: true, studentCode: true } })
  if (!student) throw new NotFoundError('student')

  const decision = decideCanDelete('student', await studentBlockers(id))
  return toReport('student', `${student.fullName} (${student.studentCode})`, student.studentCode, decision, [
    'their enrolment placement',
    'their portal account, if they have one',
  ])
}

export async function deleteStudent(
  ctx: AuthContext,
  id: string,
  confirm: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ deleted: true }> {
  assertAdminArea(ctx, 'Student records')
  authorize(ctx, 'students.delete')

  const student = await prisma.student.findUnique({ where: { id }, select: { id: true, fullName: true, studentCode: true, userId: true } })
  if (!student) throw new NotFoundError('student')

  if (!confirmationMatches(student.studentCode, confirm)) {
    throw new ValidationError(`Type ${student.studentCode} to confirm that this is the record you mean to erase.`, {
      confirm: ['That is not this student’s code.'],
    })
  }

  const decision = decideCanDelete('student', await studentBlockers(id))
  if (!decision.allowed) throw new ConflictError(decision.reason)

  // The account is checked on its own terms: erasing a student must not
  // quietly erase an account that has acted in the system.
  if (student.userId) {
    const audits = await prisma.auditLog.count({ where: { actorUserId: student.userId } })
    if (audits > 0) {
      throw new ConflictError(
        'This student has a portal account that has been used, and erasing it would take the record of what it did with it. ' +
          'Deactivate the student instead.',
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentEnrollment.deleteMany({ where: { studentId: id } })
    await tx.student.delete({ where: { id } })
    if (student.userId) {
      await tx.session.deleteMany({ where: { userId: student.userId } })
      await tx.userPermission.deleteMany({ where: { userId: student.userId } })
      await tx.user.delete({ where: { id: student.userId } })
    }
    await writeAuditLog(
      ctx,
      {
        action: 'student.erased',
        entityType: 'student',
        entityId: id,
        entityLabel: `${student.fullName} (${student.studentCode})`,
        metadata: { studentCode: student.studentCode, hadAccount: student.userId !== null },
        request,
      },
      tx,
    )
  })

  return { deleted: true }
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

async function staffBlockers(id: string): Promise<Blocker[]> {
  const [registers, marks, homework, attendance, documents, lessons] = await Promise.all([
    prisma.attendanceSheet.count({ where: { markedByStaffId: id } }),
    prisma.examMarkSheet.count({ where: { enteredByStaffId: id } }),
    prisma.homework.count({ where: { staffId: id } }),
    prisma.staffAttendance.count({ where: { staffId: id } }),
    prisma.document.count({ where: { staffId: id } }),
    prisma.timetableSlot.count({ where: { staffId: id } }),
  ])
  return [
    { what: 'registers they took', count: registers },
    { what: 'mark sheets', count: marks },
    { what: 'pieces of homework', count: homework },
    { what: 'days on the staff register', count: attendance },
    { what: 'documents', count: documents },
    { what: 'lessons on the timetable', count: lessons },
  ]
}

export async function getStaffDeletionReport(ctx: AuthContext, id: string): Promise<DeletionReport> {
  assertAdminArea(ctx, 'Staff records')
  authorize(ctx, 'staff.delete')

  const staff = await prisma.staff.findUnique({ where: { id }, select: { id: true, fullName: true, staffCode: true } })
  if (!staff) throw new NotFoundError('staff member')

  const decision = decideCanDelete('staff member', await staffBlockers(id))
  return toReport('staff member', `${staff.fullName} (${staff.staffCode})`, staff.staffCode, decision, [
    'their subject and section assignments',
    'their portal account, if they have one',
  ])
}

export async function deleteStaff(
  ctx: AuthContext,
  id: string,
  confirm: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ deleted: true }> {
  assertAdminArea(ctx, 'Staff records')
  authorize(ctx, 'staff.delete')

  const staff = await prisma.staff.findUnique({ where: { id }, select: { id: true, fullName: true, staffCode: true, userId: true } })
  if (!staff) throw new NotFoundError('staff member')

  if (!confirmationMatches(staff.staffCode, confirm)) {
    throw new ValidationError(`Type ${staff.staffCode} to confirm that this is the record you mean to erase.`, {
      confirm: ['That is not this staff member’s code.'],
    })
  }

  const decision = decideCanDelete('staff member', await staffBlockers(id))
  if (!decision.allowed) throw new ConflictError(decision.reason)

  if (staff.userId) {
    const audits = await prisma.auditLog.count({ where: { actorUserId: staff.userId } })
    if (audits > 0) {
      throw new ConflictError(
        'This member of staff has an account that has been used, and erasing it would take the record of what it did with it. ' +
          'Deactivate them instead.',
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherAssignment.deleteMany({ where: { staffId: id } })
    await tx.staff.delete({ where: { id } })
    if (staff.userId) {
      await tx.session.deleteMany({ where: { userId: staff.userId } })
      await tx.userPermission.deleteMany({ where: { userId: staff.userId } })
      await tx.user.delete({ where: { id: staff.userId } })
    }
    await writeAuditLog(
      ctx,
      {
        action: 'staff.erased',
        entityType: 'staff',
        entityId: id,
        entityLabel: `${staff.fullName} (${staff.staffCode})`,
        metadata: { staffCode: staff.staffCode, hadAccount: staff.userId !== null },
        request,
      },
      tx,
    )
  })

  return { deleted: true }
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* -------------------------------------------------------------------------- */

async function accountBlockers(id: string): Promise<Blocker[]> {
  // An audit entry names the person who acted only by this id. Erasing the
  // account would leave every one of those entries saying nobody did it, so
  // the log itself is what stands in the way.
  const [audits, profileStudent, profileStaff] = await Promise.all([
    prisma.auditLog.count({ where: { actorUserId: id } }),
    prisma.student.count({ where: { userId: id } }),
    prisma.staff.count({ where: { userId: id } }),
  ])
  return [
    { what: 'entries in the audit log', count: audits },
    { what: 'student records', count: profileStudent },
    { what: 'staff records', count: profileStaff },
  ]
}

export async function getAccountDeletionReport(ctx: AuthContext, id: string): Promise<DeletionReport> {
  assertAdminArea(ctx, 'User accounts')
  authorize(ctx, 'users.manage')

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, fullName: true, role: true, isSystemOwner: true } })
  if (!user) throw new NotFoundError('account')

  const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  const safety = decideCanDeleteAccount(
    { userId: ctx.userId },
    { userId: user.id, role: user.role, isSystemOwner: user.isSystemOwner, username: user.username },
    activeAdminCount,
  )
  const decision = safety.allowed ? decideCanDelete('account', await accountBlockers(id)) : safety

  return toReport('account', `${user.fullName ?? user.username} (${user.username})`, user.username, decision, ['their signed-in devices'])
}

export async function deleteAccount(
  ctx: AuthContext,
  id: string,
  confirm: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ deleted: true }> {
  assertAdminArea(ctx, 'User accounts')
  authorize(ctx, 'users.manage')

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, fullName: true, role: true, isSystemOwner: true } })
  if (!user) throw new NotFoundError('account')

  if (!confirmationMatches(user.username, confirm)) {
    throw new ValidationError(`Type ${user.username} to confirm that this is the account you mean to erase.`, {
      confirm: ['That is not this account’s username.'],
    })
  }

  const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  const safety = decideCanDeleteAccount(
    { userId: ctx.userId },
    { userId: user.id, role: user.role, isSystemOwner: user.isSystemOwner, username: user.username },
    activeAdminCount,
  )
  if (!safety.allowed) throw new ForbiddenError(safety.reason, { userId: ctx.userId, role: ctx.role })

  const decision = decideCanDelete('account', await accountBlockers(id))
  if (!decision.allowed) throw new ConflictError(decision.reason)

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: id } })
    await tx.userPermission.deleteMany({ where: { userId: id } })
    await tx.user.delete({ where: { id } })
    await writeAuditLog(
      ctx,
      {
        action: 'user.erased',
        entityType: 'user',
        entityId: id,
        entityLabel: `${user.fullName ?? user.username} (${user.username})`,
        metadata: { username: user.username, role: user.role },
        request,
      },
      tx,
    )
  })

  return { deleted: true }
}

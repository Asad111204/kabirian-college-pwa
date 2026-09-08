/**
 * Who may mark, correct and read a register.
 *
 * Written as pure functions with no database access, in the same shape as
 * `documents/access.ts` (ADR-071): the service resolves the facts — does this
 * teacher hold an active assignment for this subject? is this sheet already
 * submitted? — and these functions decide. That way every rule below has a test
 * proving both the case it allows and the case it refuses, rather than a comment
 * claiming it.
 */

export type AttendanceDecision =
  | { allowed: true }
  | { allowed: false; code: AttendanceRefusal; reason: string }

export type AttendanceRefusal =
  | 'NO_PERMISSION'
  | 'NOT_ASSIGNED'
  | 'NOT_INCHARGE'
  | 'NOT_ADMIN_AREA'
  | 'SHEET_SUBMITTED'
  | 'SHEET_CANCELLED'
  | 'CORRECTION_WINDOW_CLOSED'

/** What the service has looked up about the person asking. */
export interface AttendanceViewer {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  /** The staff record linked to this login, if any. */
  staffId: string | null
  /** True when they hold the matching permission. */
  canCreate: boolean
  canUpdate: boolean
  canUpdateSubmitted: boolean
}

/** What the service has looked up about the section and subject being marked. */
export interface MarkingContext {
  /** Subject-wise when set, daily roll-call when null. */
  subjectId: string | null
  /** An ACTIVE TeacherAssignment exists for this staff + section + subject. */
  hasActiveAssignment: boolean
  /** An ACTIVE SectionIncharge exists for this staff + section. */
  isActiveIncharge: boolean
}

/**
 * May this person create or mark a register for this section and subject?
 *
 * The two kinds of attendance have deliberately different gates:
 *
 *   - **Subject-wise** (`subjectId` set) needs an ACTIVE `TeacherAssignment`
 *     for that exact section *and* subject. This is the rule that stops the
 *     Biology teacher marking Chemistry in a section they already teach —
 *     section-level scope alone would allow it, which is why
 *     `getScopedSectionIds()` is not sufficient on its own here.
 *
 *   - **Daily roll-call** (`subjectId` null) needs an ACTIVE `SectionIncharge`.
 *     Taking the whole section's attendance is the class teacher's job, not
 *     something every subject teacher may do.
 *
 * An administrator may do both, subject to holding the permission.
 */
export function decideCanMarkAttendance(
  viewer: AttendanceViewer,
  context: MarkingContext,
): AttendanceDecision {
  if (!viewer.canCreate) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'You do not have permission to mark attendance.',
    }
  }

  if (viewer.role === 'ADMIN') return { allowed: true }

  if (viewer.role !== 'STAFF' || viewer.staffId === null) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'Only teachers and administrators can mark attendance.',
    }
  }

  if (context.subjectId === null) {
    return context.isActiveIncharge
      ? { allowed: true }
      : {
          allowed: false,
          code: 'NOT_INCHARGE',
          reason:
            'Daily attendance is taken by the section in-charge. You are not the in-charge of this section.',
        }
  }

  return context.hasActiveAssignment
    ? { allowed: true }
    : {
        allowed: false,
        code: 'NOT_ASSIGNED',
        reason: 'You are not assigned to teach this subject in this section.',
      }
}

/** The office's rule for how long a teacher may correct a submitted register. */
export interface CorrectionRule {
  /** The moment being decided at. */
  now: Date
  /** Days after submission a teacher may still correct; 0 = only the office. */
  teacherCorrectionDays: number
}

/** When a teacher's right to correct a submitted register runs out, or null when it never began. */
export function teacherCorrectionDeadline(submittedAt: Date | null, teacherCorrectionDays: number): Date | null {
  if (!submittedAt || teacherCorrectionDays <= 0) return null
  return new Date(submittedAt.getTime() + teacherCorrectionDays * 24 * 60 * 60 * 1000)
}

/**
 * May this person change an entry on an existing sheet?
 *
 * On top of being allowed to mark the sheet at all:
 *
 *   - a **cancelled** sheet is closed to everyone; the class did not happen;
 *   - a **submitted** sheet needs `attendance.update_submitted`. The office
 *     holds it outright. A teacher holds it too (Phase 18), but only for the
 *     window the office sets after submission — `teacherCorrectionDays`,
 *     seven by default, zero for "only the office" — and only for their own
 *     sections, as ever. Either way the correction is audited.
 */
export function decideCanEditSheet(
  viewer: AttendanceViewer,
  context: MarkingContext,
  sheet: { status: 'DRAFT' | 'SUBMITTED' | 'CANCELLED'; submittedAt?: Date | null },
  rule?: CorrectionRule,
): AttendanceDecision {
  if (sheet.status === 'CANCELLED') {
    return {
      allowed: false,
      code: 'SHEET_CANCELLED',
      reason: 'This class was cancelled, so its attendance cannot be changed.',
    }
  }

  if (!viewer.canUpdate) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'You do not have permission to change attendance.',
    }
  }

  const marking = decideCanMarkAttendance({ ...viewer, canCreate: true }, context)
  if (!marking.allowed) return marking

  if (sheet.status === 'SUBMITTED') {
    if (!viewer.canUpdateSubmitted) {
      return {
        allowed: false,
        code: 'SHEET_SUBMITTED',
        reason: 'This attendance has already been submitted. Ask the office to correct it.',
      }
    }
    if (viewer.role !== 'ADMIN' && rule) {
      if (rule.teacherCorrectionDays <= 0) {
        return {
          allowed: false,
          code: 'CORRECTION_WINDOW_CLOSED',
          reason: 'Submitted attendance can only be corrected by the office. Ask the office to correct it.',
        }
      }
      const deadline = teacherCorrectionDeadline(sheet.submittedAt ?? null, rule.teacherCorrectionDays)
      if (!deadline || rule.now.getTime() > deadline.getTime()) {
        return {
          allowed: false,
          code: 'CORRECTION_WINDOW_CLOSED',
          reason: `Teachers can correct a submitted register for ${rule.teacherCorrectionDays} day${rule.teacherCorrectionDays === 1 ? '' : 's'} after submitting it. That time has passed — ask the office to correct it.`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * May this person cancel a register?
 *
 * Cancelling wipes a class off everyone's percentage, so it is treated as a
 * correction rather than as ordinary marking: it needs `attendance.update` for
 * a draft, and `attendance.update_submitted` once the sheet has been handed in.
 */
export function decideCanCancelSheet(
  viewer: AttendanceViewer,
  context: MarkingContext,
  sheet: { status: 'DRAFT' | 'SUBMITTED' | 'CANCELLED' },
): AttendanceDecision {
  if (sheet.status === 'CANCELLED') {
    return {
      allowed: false,
      code: 'SHEET_CANCELLED',
      reason: 'This class is already cancelled.',
    }
  }
  return decideCanEditSheet(viewer, context, sheet)
}

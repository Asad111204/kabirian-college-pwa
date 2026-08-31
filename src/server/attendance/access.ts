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

/**
 * May this person change an entry on an existing sheet?
 *
 * On top of being allowed to mark the sheet at all:
 *
 *   - a **cancelled** sheet is closed to everyone; the class did not happen;
 *   - a **submitted** sheet is closed to teachers, and open only to someone
 *     holding `attendance.update_submitted` — which by default is the office
 *     alone. A teacher fixes their own mistakes while the sheet is a draft;
 *     after they hand it in, changes leave the office's fingerprints.
 */
export function decideCanEditSheet(
  viewer: AttendanceViewer,
  context: MarkingContext,
  sheet: { status: 'DRAFT' | 'SUBMITTED' | 'CANCELLED' },
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

  if (sheet.status === 'SUBMITTED' && !viewer.canUpdateSubmitted) {
    return {
      allowed: false,
      code: 'SHEET_SUBMITTED',
      reason:
        'This attendance has already been submitted. Ask the office to correct it.',
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

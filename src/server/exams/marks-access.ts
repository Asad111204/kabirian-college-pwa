/**
 * Who may enter, change and submit marks.
 *
 * Written as pure functions with no database access, in the same shape as
 * `attendance/access.ts` (ADR-071): the service resolves the facts — does this
 * teacher hold an active assignment for this subject in this section? is the
 * sheet already submitted? has the date sheet been published? — and these
 * functions decide. Every rule below has a test proving both the case it allows
 * and the case it refuses, rather than a comment claiming it.
 */
import type { ExamStatusValue } from '@/validation/exams'

export type MarksDecision =
  | { allowed: true }
  | { allowed: false; code: MarksRefusal; reason: string }

export type MarksRefusal =
  | 'NO_PERMISSION'
  | 'NOT_STAFF'
  | 'NOT_ASSIGNED'
  | 'EXAM_NOT_OPEN'
  | 'SHEET_SUBMITTED'
  | 'SHEET_PUBLISHED'
  | 'DEADLINE_PASSED'

/** What the service has looked up about the person asking. */
export interface MarksViewer {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  /** The staff record linked to this login, if any. */
  staffId: string | null
  canEnter: boolean
  canUpdate: boolean
  canUpdateSubmitted: boolean
}

/** What the service has looked up about the paper and section being marked. */
export interface MarkingContext {
  /** An ACTIVE TeacherAssignment exists for this staff + section + subject. */
  hasActiveAssignment: boolean
  /** The exam's own status, which decides whether marking is open at all. */
  examStatus: ExamStatusValue
}

/**
 * The office's deadline for this exam, and any reopening of this one paper
 * (Phase 21). All dates are college dates, YYYY-MM-DD; null means "none".
 * The office is never bound by any of it.
 */
export interface MarksWindow {
  today: string
  deadline: string | null
  reopenedUntil: string | null
}

/**
 * Is the door still open for a teacher: no deadline, the deadline has not
 * passed, or the office reopened this paper and that reopening has not passed
 * either?
 */
export function isWithinMarksWindow(window: MarksWindow): boolean {
  if (!window.deadline) return true
  if (window.today <= window.deadline) return true
  return window.reopenedUntil !== null && window.today <= window.reopenedUntil
}

/** 2026-09-12 -> 12 Sep 2026, for a sentence a teacher reads. */
function readableDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

function refusalForWindow(window: MarksWindow): MarksDecision {
  return {
    allowed: false,
    code: 'DEADLINE_PASSED',
    reason: window.reopenedUntil
      ? `This paper was reopened until ${readableDate(window.reopenedUntil)}. That time has passed — ask the office to reopen it again.`
      : `The deadline for entering marks for this exam was ${readableDate(window.deadline ?? '')}. Ask the office to reopen this paper.`,
  }
}

/**
 * Marking is open between publishing the date sheet and finishing the exam.
 *
 * `DRAFT` means the schedule has not gone out, or has been withdrawn — the
 * paper may still move, so marking it would be marking something provisional.
 * `CANCELLED` means the exam did not happen. `COMPLETED` means results are
 * done, and reopening that is a decision for the office, not a side effect of a
 * teacher opening a screen.
 *
 * There is deliberately **no rule about today's date**. The college has not set
 * one, and inventing "you may only mark on or after the exam date" would refuse
 * a teacher entering last week's papers on a Monday morning.
 */
export function isMarkingOpen(examStatus: ExamStatusValue): boolean {
  return examStatus === 'SCHEDULED' || examStatus === 'MARKS_ENTRY'
}

function refusalForExam(examStatus: ExamStatusValue): MarksDecision {
  const reason =
    examStatus === 'DRAFT'
      ? 'This exam’s date sheet has not been published yet, so its papers cannot be marked.'
      : examStatus === 'CANCELLED'
        ? 'This exam was cancelled, so its papers cannot be marked.'
        : 'This exam is finished. Ask the office if a mark still needs to change.'
  return { allowed: false, code: 'EXAM_NOT_OPEN', reason }
}

/**
 * May this person enter marks for this paper and section?
 *
 * A teacher needs an ACTIVE `TeacherAssignment` for that exact **section and
 * subject**. Section-level scope is not enough: it would let the Biology
 * teacher mark Chemistry in a section they already teach. This is the same rule
 * subject-wise attendance uses, and it reuses the same records — there is no
 * second teacher-subject system.
 *
 * An administrator may enter marks too, subject to holding the permission, so
 * the office can key in a paper for a teacher who has left.
 */
export function decideCanEnterMarks(
  viewer: MarksViewer,
  context: MarkingContext,
  window?: MarksWindow,
): MarksDecision {
  if (!viewer.canEnter) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'You do not have permission to enter marks.',
    }
  }

  if (!isMarkingOpen(context.examStatus)) return refusalForExam(context.examStatus)

  if (viewer.role === 'ADMIN') return { allowed: true }

  if (viewer.role !== 'STAFF' || viewer.staffId === null) {
    return {
      allowed: false,
      code: 'NOT_STAFF',
      reason: 'Only teachers and administrators can enter marks.',
    }
  }

  if (!context.hasActiveAssignment) {
    return {
      allowed: false,
      code: 'NOT_ASSIGNED',
      reason: 'You are not assigned to teach this subject in this section.',
    }
  }

  // The office's deadline binds teachers only (Phase 21).
  if (window && !isWithinMarksWindow(window)) return refusalForWindow(window)

  return { allowed: true }
}

/**
 * May this person change marks on an existing sheet?
 *
 * On top of being allowed to mark it at all, a **submitted** sheet is closed to
 * teachers and open only to someone holding `marks.update_submitted` — which by
 * default is the office alone. A teacher fixes their own mistakes while the
 * sheet is a draft; after they hand it in, a change leaves the office's
 * fingerprints on it.
 */
export function decideCanEditMarks(
  viewer: MarksViewer,
  context: MarkingContext,
  sheet: { status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED' },
  window?: MarksWindow,
): MarksDecision {
  if (!viewer.canUpdate) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'You do not have permission to change marks.',
    }
  }

  const entering = decideCanEnterMarks({ ...viewer, canEnter: true }, context, window)
  if (!entering.allowed) return entering

  if (sheet.status === 'DRAFT') return { allowed: true }

  if (!viewer.canUpdateSubmitted) {
    return {
      allowed: false,
      code: 'SHEET_SUBMITTED',
      reason:
        'These marks have already been submitted and cannot be edited. Please contact the administrator if a correction is required.',
    }
  }

  // Published marks are the source of a result card. Correcting one is the
  // office's decision, never a teacher's: theirs would silently disagree with
  // a card a student is already holding.
  if (sheet.status === 'PUBLISHED' && viewer.role !== 'ADMIN') {
    return {
      allowed: false,
      code: 'SHEET_PUBLISHED',
      reason: 'These marks have been published, so a result has been made from them. Only the office can correct them now.',
    }
  }

  return { allowed: true }
}

/**
 * May this person hand the sheet in?
 *
 * Submitting is ordinary marking work, so it needs no more than being allowed
 * to edit a draft. Whether the sheet is *complete* is a separate question, and
 * is decided by {@link findUnenteredStudents}.
 */
export function decideCanSubmitMarks(
  viewer: MarksViewer,
  context: MarkingContext,
  sheet: { status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED' },
  window?: MarksWindow,
): MarksDecision {
  if (sheet.status !== 'DRAFT') {
    return {
      allowed: false,
      code: 'SHEET_SUBMITTED',
      reason: 'These marks have already been submitted.',
    }
  }
  return decideCanEditMarks(viewer, context, sheet, window)
}

/**
 * The students who still have no mark.
 *
 * A sheet may only be handed in when every student is either `ENTERED` or
 * `ABSENT`. `PENDING` means nobody has looked at that paper yet, and submitting
 * it would freeze a blank into the record — which is exactly the thing the
 * three-state model exists to prevent.
 */
export function findUnenteredStudents<T extends { status: 'PENDING' | 'ENTERED' | 'ABSENT' }>(
  marks: readonly T[],
): T[] {
  return marks.filter((mark) => mark.status === 'PENDING')
}

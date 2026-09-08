/**
 * Complaints: who may write on an application, and what may happen to it next.
 *
 * Pure functions with no database, in the shape of `homework-policy.ts`. The
 * service resolves the facts — whose application is this, who is signed in,
 * what state is it in — and these decide, each tested from both sides.
 *
 * The college's rule, confirmed for this phase: a **student** writes an
 * application to the office; the **office** reads it and answers. Nobody else
 * is involved. A teacher cannot read a student's complaint, because the
 * complaint may well be about a teacher.
 */

export const COMPLAINT_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'RESOLVED', 'WITHDRAWN'] as const
export type ComplaintStatusValue = (typeof COMPLAINT_STATUSES)[number]

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatusValue, string> = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'Being looked at',
  RESOLVED: 'Resolved',
  WITHDRAWN: 'Withdrawn',
}

export const COMPLAINT_STATUS_TONE: Record<ComplaintStatusValue, 'info' | 'warning' | 'success' | 'neutral'> = {
  SUBMITTED: 'info',
  IN_REVIEW: 'warning',
  RESOLVED: 'success',
  WITHDRAWN: 'neutral',
}

export const COMPLAINT_CATEGORIES = ['ACADEMIC', 'ATTENDANCE', 'EXAMS_RESULTS', 'FEES', 'FACILITIES', 'DISCIPLINE', 'OTHER'] as const
export type ComplaintCategoryValue = (typeof COMPLAINT_CATEGORIES)[number]

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategoryValue, string> = {
  ACADEMIC: 'Teaching and classes',
  ATTENDANCE: 'Attendance',
  EXAMS_RESULTS: 'Exams and results',
  FEES: 'Fees',
  FACILITIES: 'Building and facilities',
  DISCIPLINE: 'Behaviour and discipline',
  OTHER: 'Something else',
}

/** How many applications a student may have open at once. */
export const MAX_OPEN_COMPLAINTS = 5

export type ComplaintDecision = { allowed: true } | { allowed: false; code: ComplaintRefusal; reason: string }
export type ComplaintRefusal = 'NO_PERMISSION' | 'NOT_YOURS' | 'ALREADY_CLOSED' | 'TOO_MANY_OPEN' | 'BAD_STATUS'

/** An application still being dealt with: either side may write on it. */
export function isComplaintOpen(status: ComplaintStatusValue): boolean {
  return status === 'SUBMITTED' || status === 'IN_REVIEW'
}

export interface ComplaintViewer {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  /** The signed-in student, from the session — never from the browser. */
  studentId: string | null
  /** True when they hold `complaints.view`. */
  canRead: boolean
  /** True when they hold `complaints.respond`. */
  canRespond: boolean
}

/**
 * May this person read this application?
 *
 * The student who wrote it, and the office. Not a teacher, not another
 * student, not the office without the permission — a complaint may name a
 * member of staff, and half the point of writing one is that it does not go
 * round the college.
 */
export function decideCanReadComplaint(viewer: ComplaintViewer, complaint: { studentId: string }): ComplaintDecision {
  if (viewer.role === 'STUDENT') {
    if (viewer.studentId !== null && viewer.studentId === complaint.studentId) return { allowed: true }
    return { allowed: false, code: 'NOT_YOURS', reason: 'This application is not yours.' }
  }
  if (viewer.role === 'ADMIN' && viewer.canRead) return { allowed: true }
  return { allowed: false, code: 'NO_PERMISSION', reason: 'Only the office and the student who wrote it can read an application.' }
}

/** May this student write another application? */
export function decideCanSubmitComplaint(viewer: ComplaintViewer, openCount: number): ComplaintDecision {
  if (viewer.role !== 'STUDENT' || viewer.studentId === null) {
    return { allowed: false, code: 'NO_PERMISSION', reason: 'Only a student can write an application to the office.' }
  }
  if (openCount >= MAX_OPEN_COMPLAINTS) {
    return {
      allowed: false,
      code: 'TOO_MANY_OPEN',
      reason: `You already have ${MAX_OPEN_COMPLAINTS} applications with the office. Please wait for one of them to be answered before writing another.`,
    }
  }
  return { allowed: true }
}

/**
 * May this person add a message to the exchange?
 *
 * While it is open, both sides may: the student to add what they forgot or
 * answer a question, the office to reply. Once it is resolved or withdrawn
 * the exchange is closed, and a student who is still unhappy writes a fresh
 * application rather than reopening an answered one behind the office's back.
 */
export function decideCanReplyToComplaint(viewer: ComplaintViewer, complaint: { studentId: string; status: ComplaintStatusValue }): ComplaintDecision {
  const read = decideCanReadComplaint(viewer, complaint)
  if (!read.allowed) return read
  if (viewer.role === 'ADMIN' && !viewer.canRespond) {
    return { allowed: false, code: 'NO_PERMISSION', reason: 'You can read applications but not answer them.' }
  }
  if (!isComplaintOpen(complaint.status)) {
    const what = complaint.status === 'RESOLVED' ? 'has been resolved' : 'was withdrawn'
    return { allowed: false, code: 'ALREADY_CLOSED', reason: `This application ${what}, so nothing more can be added to it.` }
  }
  return { allowed: true }
}

/**
 * May this student take their application back?
 *
 * Only the student, and only while it is open. Withdrawing is not deleting:
 * the application stays on the record, marked as taken back.
 */
export function decideCanWithdrawComplaint(viewer: ComplaintViewer, complaint: { studentId: string; status: ComplaintStatusValue }): ComplaintDecision {
  if (viewer.role !== 'STUDENT' || viewer.studentId === null || viewer.studentId !== complaint.studentId) {
    return { allowed: false, code: 'NOT_YOURS', reason: 'Only the student who wrote an application can withdraw it.' }
  }
  if (!isComplaintOpen(complaint.status)) {
    const what = complaint.status === 'RESOLVED' ? 'has already been resolved' : 'has already been withdrawn'
    return { allowed: false, code: 'ALREADY_CLOSED', reason: `This application ${what}.` }
  }
  return { allowed: true }
}

/**
 * Where the office may move an application next.
 *
 * A resolved one may be picked back up — an answer that turned out to be
 * wrong should be corrected on the same application, not buried. A withdrawn
 * one is the student's decision and the office does not undo it, and the
 * office never withdraws on a student's behalf.
 */
const OFFICE_TRANSITIONS: Record<ComplaintStatusValue, readonly ComplaintStatusValue[]> = {
  SUBMITTED: ['IN_REVIEW', 'RESOLVED'],
  IN_REVIEW: ['RESOLVED'],
  RESOLVED: ['IN_REVIEW'],
  WITHDRAWN: [],
}

export function decideCanSetComplaintStatus(viewer: ComplaintViewer, from: ComplaintStatusValue, to: ComplaintStatusValue): ComplaintDecision {
  if (viewer.role !== 'ADMIN' || !viewer.canRespond) {
    return { allowed: false, code: 'NO_PERMISSION', reason: 'Only the office can change what state an application is in.' }
  }
  if (from === to) {
    return { allowed: false, code: 'BAD_STATUS', reason: `This application is already marked "${COMPLAINT_STATUS_LABEL[to]}".` }
  }
  if (!OFFICE_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      code: 'BAD_STATUS',
      reason: `An application marked "${COMPLAINT_STATUS_LABEL[from]}" cannot be moved to "${COMPLAINT_STATUS_LABEL[to]}".`,
    }
  }
  return { allowed: true }
}

/** What the office may move this application to, for the buttons on the screen. */
export function nextStatusesFor(status: ComplaintStatusValue): readonly ComplaintStatusValue[] {
  return OFFICE_TRANSITIONS[status]
}

/**
 * The state an application lands in when the office answers it.
 *
 * Replying to a new application takes it off the pile of unread post without
 * anybody having to remember to press a second button.
 */
export function statusAfterOfficeReply(status: ComplaintStatusValue): ComplaintStatusValue {
  return status === 'SUBMITTED' ? 'IN_REVIEW' : status
}

/**
 * What happened to an application, as far as whose move it is next.
 *
 * The answer is stored on the row rather than worked out from the last
 * message each time, so the office's "everything still on my desk" is one
 * indexed query. This function is the only thing that decides what to store.
 */
export type ComplaintEvent = 'SUBMITTED' | 'STUDENT_REPLIED' | 'OFFICE_REPLIED' | 'REOPENED' | 'RESOLVED' | 'WITHDRAWN'

export function awaitingOfficeAfter(event: ComplaintEvent): boolean {
  switch (event) {
    // A new application, and anything more the student adds, is the office's move.
    case 'SUBMITTED':
    case 'STUDENT_REPLIED':
      return true
    // Reopening is the office deciding it has more to do.
    case 'REOPENED':
      return true
    // The office has answered: the ball is with the student, or nowhere.
    case 'OFFICE_REPLIED':
    case 'RESOLVED':
    case 'WITHDRAWN':
      return false
  }
}

/**
 * Who the application is waiting on, so neither side has to guess. Nobody,
 * once it is closed.
 */
export function awaitingFor(complaint: { status: ComplaintStatusValue; awaitingOffice: boolean }): 'OFFICE' | 'STUDENT' | null {
  if (!isComplaintOpen(complaint.status)) return null
  return complaint.awaitingOffice ? 'OFFICE' : 'STUDENT'
}

/**
 * How long the office has left it, in whole days, for the list.
 *
 * Only for an application still waiting on the office: once it has been
 * answered the number stops being a reproach and starts being noise.
 */
export function waitingDays(lastActivityIso: string, nowIso: string): number {
  const ms = Date.parse(nowIso) - Date.parse(lastActivityIso)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.floor(ms / 86_400_000)
}

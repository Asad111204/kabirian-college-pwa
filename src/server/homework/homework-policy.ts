/**
 * Who may set homework, and who may see it.
 *
 * Pure functions, no database, in the shape of `attendance/access.ts`: the
 * service resolves the facts — does this teacher hold an ACTIVE assignment
 * for this section and subject? which section is this student in? — and
 * these functions decide, each tested from both sides.
 *
 * The rule is the one the college already lives by for attendance and marks:
 * a teacher acts only where a `TeacherAssignment` says they teach. Homework
 * for Biology in 11-A can be set by the teacher assigned to Biology in 11-A,
 * and by the office; nobody else. It is read by every student enrolled in
 * 11-A, by every teacher who teaches in 11-A, and by the office.
 */

export type HomeworkDecision = { allowed: true } | { allowed: false; code: HomeworkRefusal; reason: string }
export type HomeworkRefusal = 'NO_PERMISSION' | 'NOT_ASSIGNED' | 'NOT_OWNER'

export interface HomeworkViewer {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  staffId: string | null
  /** True when they hold `homework.manage`. */
  canManage: boolean
}

export interface HomeworkContext {
  /** An ACTIVE TeacherAssignment exists for this staff + section + subject. */
  hasActiveAssignment: boolean
  /** Who set it (for edits and deletes); null when creating. */
  ownerStaffId: string | null
}

/**
 * May this person create homework for this section and subject — or change
 * or remove the piece named by `ownerStaffId`?
 *
 * The office may. A teacher needs the permission, the assignment, and — for
 * an existing piece — to be the one who set it: a colleague who also teaches
 * the section does not rewrite another teacher's homework.
 */
export function decideCanManageHomework(viewer: HomeworkViewer, context: HomeworkContext): HomeworkDecision {
  if (!viewer.canManage) {
    return { allowed: false, code: 'NO_PERMISSION', reason: 'You do not have permission to set homework.' }
  }
  if (viewer.role === 'ADMIN') return { allowed: true }
  if (viewer.role !== 'STAFF' || viewer.staffId === null) {
    return { allowed: false, code: 'NO_PERMISSION', reason: 'Only teachers and the office can set homework.' }
  }
  if (!context.hasActiveAssignment) {
    return { allowed: false, code: 'NOT_ASSIGNED', reason: 'You are not assigned to teach this subject in this section.' }
  }
  if (context.ownerStaffId !== null && context.ownerStaffId !== viewer.staffId) {
    return { allowed: false, code: 'NOT_OWNER', reason: 'This homework was set by another teacher. Only they, or the office, can change it.' }
  }
  return { allowed: true }
}

export interface HomeworkReader {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  /** A student's current section, or null when not enrolled anywhere. */
  placementSectionId: string | null
  /** The sections a staff member teaches in or runs. */
  scopedSectionIds: readonly string[]
}

/** May this person read homework set for `sectionId`? */
export function isHomeworkVisible(reader: HomeworkReader, homework: { sectionId: string }): boolean {
  if (reader.role === 'ADMIN') return true
  if (reader.role === 'STUDENT') return reader.placementSectionId !== null && reader.placementSectionId === homework.sectionId
  return reader.scopedSectionIds.includes(homework.sectionId)
}

/** "Due today", "Due in 3 days", "Overdue by 2 days", or null when there is no date. */
export function describeDue(dueDate: string | null, today: string): { label: string; tone: 'neutral' | 'warning' | 'danger' } | null {
  if (!dueDate) return null
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days === 0) return { label: 'Due today', tone: 'warning' }
  if (days === 1) return { label: 'Due tomorrow', tone: 'warning' }
  if (days > 1) return { label: `Due in ${days} days`, tone: 'neutral' }
  if (days === -1) return { label: 'Was due yesterday', tone: 'danger' }
  return { label: `Was due ${-days} days ago`, tone: 'danger' }
}

/**
 * Pure helpers for the admin dashboard.
 *
 * These take plain data and return plain data — no database, no request, no
 * React. That keeps the shaping logic (counting users, building the academic
 * tree, describing an audit entry safely) unit-testable on its own, and keeps
 * the service itself down to "fetch, then call these".
 */
import type { UserRole, UserStatus } from '@/generated/prisma/enums'

/* -------------------------------------------------------------------------- */
/* User statistics                                                            */
/* -------------------------------------------------------------------------- */

export interface UserCountRow {
  role: UserRole
  status: UserStatus
  _count: { _all: number }
}

export interface UserStatistics {
  total: number
  active: number
  inactive: number
  byRole: { ADMIN: number; STAFF: number; STUDENT: number }
  activeByRole: { ADMIN: number; STAFF: number; STUDENT: number }
}

/**
 * Turns one grouped database query into every user figure the dashboard shows.
 *
 * Doing it this way means the database is asked once — `GROUP BY role, status` —
 * rather than six separate COUNT queries.
 */
export function summariseUserCounts(rows: UserCountRow[]): UserStatistics {
  const stats: UserStatistics = {
    total: 0,
    active: 0,
    inactive: 0,
    byRole: { ADMIN: 0, STAFF: 0, STUDENT: 0 },
    activeByRole: { ADMIN: 0, STAFF: 0, STUDENT: 0 },
  }

  for (const row of rows) {
    const count = row._count._all
    stats.total += count
    stats.byRole[row.role] += count

    if (row.status === 'ACTIVE') {
      stats.active += count
      stats.activeByRole[row.role] += count
    } else {
      stats.inactive += count
    }
  }

  return stats
}

/* -------------------------------------------------------------------------- */
/* Academic structure tree                                                    */
/* -------------------------------------------------------------------------- */

/** One row as the academic-structure service returns it. */
export interface FlatGroup {
  id: string
  classId: string
  className: string
  classDisplayName: string | null
  classLevel: number
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  programCode: string
  isActive: boolean
  sections: { id: string; name: string; isActive: boolean; studentCount: number }[]
}

export interface StructureProgramNode {
  programId: string
  programName: string
  programCode: string
  sectionNames: string[]
  studentCount: number
}

export interface StructureDivisionNode {
  divisionId: string
  divisionName: string
  programs: StructureProgramNode[]
}

export interface StructureClassNode {
  classId: string
  className: string
  classLevel: number
  divisions: StructureDivisionNode[]
  programCount: number
  sectionCount: number
  studentCount: number
}

/**
 * Groups the flat list into Class -> Division -> Program for display.
 *
 * Nothing about the college is assumed here: whatever classes, divisions and
 * programs exist in the database are what appears. Adding "I.Com" in Academic
 * Management makes it show up on the dashboard with no code change.
 */
export function buildStructureTree(groups: FlatGroup[]): StructureClassNode[] {
  const classes = new Map<string, StructureClassNode>()

  for (const group of groups) {
    let classNode = classes.get(group.classId)
    if (!classNode) {
      classNode = {
        classId: group.classId,
        className: group.classDisplayName ?? group.className,
        classLevel: group.classLevel,
        divisions: [],
        programCount: 0,
        sectionCount: 0,
        studentCount: 0,
      }
      classes.set(group.classId, classNode)
    }

    let divisionNode = classNode.divisions.find((d) => d.divisionId === group.divisionId)
    if (!divisionNode) {
      divisionNode = {
        divisionId: group.divisionId,
        divisionName: group.divisionName,
        programs: [],
      }
      classNode.divisions.push(divisionNode)
    }

    const activeSections = group.sections.filter((s) => s.isActive)
    const studentCount = group.sections.reduce((sum, s) => sum + s.studentCount, 0)

    divisionNode.programs.push({
      programId: group.programId,
      programName: group.programName,
      programCode: group.programCode,
      sectionNames: activeSections.map((s) => s.name),
      studentCount,
    })

    classNode.programCount += 1
    classNode.sectionCount += activeSections.length
    classNode.studentCount += studentCount
  }

  // The service already orders by class level, division order and program
  // order, so insertion order is the college's own ordering.
  return [...classes.values()]
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How each audited action is described on the dashboard.
 *
 * Only the action name, who did it, which record, and when are ever shown. The
 * stored before/after snapshots are NOT rendered here — they can contain
 * personal details, and the dashboard is a summary, not an inspection tool.
 * The audit viewer (Phase 14) uses the same sentences, and shows a snapshot
 * only after `audit-redaction.ts` has been over it.
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  // accounts
  'user.created': 'created the account',
  'user.updated': 'updated the account',
  'user.activated': 'activated the account',
  'user.deactivated': 'deactivated the account',
  'user.password_reset': 'reset the password for',
  'user.role_changed': 'changed the role of',
  'user.unlocked': 'unlocked the account',
  'user.sessions_revoked': 'signed out all devices for',
  'permission.granted': 'granted a permission to',
  'permission.revoked': 'revoked a permission from',
  'permission.override_removed': 'removed a permission exception from',
  // authentication
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.login_failed': 'had a failed sign-in attempt',
  'auth.password_changed': 'changed their own password',
  // students
  'student.created': 'admitted',
  'student.updated': 'updated the record for',
  'student.status_changed': 'changed the status of',
  'student.account_linked': 'linked a portal account for',
  'student.account_unlinked': 'unlinked the portal account for',
  'enrollment.created': 'enrolled',
  'enrollment.updated': 'updated the enrolment of',
  'enrollment.transferred': 'transferred',
  'enrollment.promoted': 'promoted',
  'enrollment.closed': 'closed the enrolment of',
  // staff
  'staff.created': 'added the staff member',
  'staff.updated': 'updated the record for',
  'staff.status_changed': 'changed the employment status of',
  'staff.account_linked': 'linked a portal account for',
  'staff.account_unlinked': 'unlinked the portal account for',
  'assignment.created': 'gave a teaching assignment to',
  'assignment.closed': 'closed a teaching assignment for',
  'incharge.assigned': 'appointed a section in-charge for',
  'incharge.changed': 'replaced the section in-charge of',
  'incharge.removed': 'removed the section in-charge of',
  'designation.created': 'created the designation',
  'designation.updated': 'updated the designation',
  'designation.activated': 'activated the designation',
  'designation.deactivated': 'deactivated the designation',
  'department.created': 'created the department',
  'department.updated': 'updated the department',
  'department.activated': 'activated the department',
  'department.deactivated': 'deactivated the department',
  // academic structure
  'academic_session.created': 'created the academic session',
  'academic_session.updated': 'updated the academic session',
  'academic_session.set_current': 'made this the current session',
  'class.created': 'created the class',
  'class.updated': 'updated the class',
  'class.activated': 'activated the class',
  'class.deactivated': 'deactivated the class',
  'division.created': 'created the division',
  'division.updated': 'updated the division',
  'division.activated': 'activated the division',
  'division.deactivated': 'deactivated the division',
  'program.created': 'created the program',
  'program.updated': 'updated the program',
  'program.activated': 'activated the program',
  'program.deactivated': 'deactivated the program',
  'subject.created': 'created the subject',
  'subject.updated': 'updated the subject',
  'subject.activated': 'activated the subject',
  'subject.deactivated': 'deactivated the subject',
  'academic_group.created': 'added to the session structure',
  'academic_group.activated': 'activated the group',
  'academic_group.deactivated': 'removed from the session structure',
  'section.created': 'created the section',
  'section.updated': 'updated the section',
  'section.activated': 'activated the section',
  'section.deactivated': 'removed the section',
  'curriculum.updated': 'updated the curriculum for',
  // account linking
  'auth.password_reset': 'had their password reset',
  'user.profile_linked': 'linked a record to',
  'user.profile_unlinked': 'unlinked the record from',
  // storage and documents
  'storage.connected': 'connected Google Drive',
  'storage.disconnected': 'disconnected Google Drive',
  'storage.folders_created': 'created the Drive folders',
  'document.uploaded': 'uploaded a document for',
  'document.replaced': 'replaced a document for',
  'document.deleted': 'deleted a document for',
  'document_type.created': 'created the document type',
  'document_type.updated': 'updated the document type',
  'document_type.activated': 'activated the document type',
  'document_type.deactivated': 'deactivated the document type',
  // attendance
  'attendance.sheet_created': 'opened an attendance sheet for',
  'attendance.submitted': 'submitted attendance for',
  'attendance.corrected': 'corrected attendance for',
  'attendance.sheet_cancelled': 'cancelled an attendance sheet for',
  // exams, marks and results
  'exam_type.created': 'created the exam type',
  'exam_type.updated': 'updated the exam type',
  'exam_type.activated': 'activated the exam type',
  'exam_type.deactivated': 'deactivated the exam type',
  'exam.created': 'created the exam',
  'exam.updated': 'updated the exam',
  'exam.status_changed': 'changed the status of the exam',
  'exam.deleted': 'deleted the exam',
  'exam_paper.created': 'added a paper to',
  'exam_paper.updated': 'updated a paper of',
  'exam_paper.deleted': 'removed a paper from',
  'date_sheet.published': 'published the date sheet for',
  'date_sheet.withdrawn': 'withdrew the date sheet for',
  'mark_sheet.opened': 'opened the mark sheet for',
  'marks.entered': 'entered marks for',
  'marks.updated': 'updated marks for',
  'marks.submitted': 'submitted marks for',
  'marks.corrected': 'corrected marks for',
  'result.generated': 'generated results for',
  'result.published': 'published results for',
  'result.corrected': 'corrected a result for',
  // timetable
  'timetable_slot.created': 'added a timetable period for',
  'timetable_slot.updated': 'changed a timetable period for',
  'timetable_slot.deactivated': 'removed a timetable period from',
  // communication
  'notice.created': 'created the notice',
  'notice.updated': 'updated the notice',
  'notice.status_changed': 'changed the status of the notice',
  'notice.deleted': 'deleted the notice',
  'event.created': 'created the event',
  'event.updated': 'updated the event',
  'event.status_changed': 'changed the status of the event',
  'event.deleted': 'deleted the event',
  // sessions (Phase 14)
  'user.session_revoked': 'signed out one device for',
  'auth.session_revoked': 'signed out one of their own devices',
  'auth.other_sessions_revoked': 'signed out their other devices',
  // settings (Phase 18)
  'settings.updated': 'changed the settings for',
  // marks deadline (Phase 21)
  'exam.marks_deadline_set': 'set the marks deadline for',
  'mark_sheet.reopened': 'reopened the mark sheet for',
  // staff attendance (Phase 22)
  'staff_attendance.marked': 'took the staff register for',
  'staff_attendance.corrected': 'corrected the staff register for',
  // homework (Phase 20)
  'auth.portal_switched': 'switched portal',
  'user.admin_access_granted': 'gave office access to',
  'user.admin_access_revoked': 'took office access from',
  'expense.recorded': 'recorded the expense',
  'expense.voided': 'voided the expense',
  'student.erased': 'permanently erased the student',
  'staff.erased': 'permanently erased the staff record',
  'user.erased': 'permanently erased the account',
  'fees.rules_updated': 'changed the fee rules',
  'fee_package.created': 'created the fee package',
  'fee_package.updated': 'changed the fee package',
  'student.fee_plan_set': 'set the fee plan for',
  'fee_voucher.issued': 'issued fee vouchers for',
  'fee_voucher.cancelled': 'cancelled the voucher',
  'fee_payment.recorded': 'recorded a fee payment for',
  'fee_payment.voided': 'voided a fee payment for',
  'complaint.submitted': 'wrote an application to the office',
  'complaint.replied': 'answered the application',
  'complaint.status_changed': 'changed the state of the application',
  'complaint.withdrawn': 'withdrew the application',
  'homework.created': 'set homework',
  'homework.updated': 'changed homework',
  'homework.deleted': 'removed homework',
}

/** "created the account" for a known action; a readable form of the key otherwise. */
export function describeAction(action: string): string {
  return ACTION_DESCRIPTIONS[action] ?? action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')
}

/** The module an action belongs to is the part before the dot. */
export function moduleOfAction(action: string): string {
  return action.split('.')[0] ?? action
}

/** Human names for the modules the audit filter offers. */
export const AUDIT_MODULE_LABELS: Record<string, string> = {
  auth: 'Sign-ins and passwords',
  user: 'User accounts',
  permission: 'Permissions',
  academic_session: 'Academic sessions',
  class: 'Classes',
  division: 'Divisions',
  program: 'Programmes',
  subject: 'Subjects',
  academic_group: 'Session structure',
  section: 'Sections',
  curriculum: 'Curriculum',
  student: 'Students',
  enrollment: 'Enrolments',
  staff: 'Staff',
  assignment: 'Teaching assignments',
  incharge: 'Section in-charges',
  designation: 'Designations',
  department: 'Departments',
  storage: 'Google Drive',
  document: 'Documents',
  document_type: 'Document types',
  attendance: 'Attendance',
  exam_type: 'Exam types',
  exam: 'Exams',
  exam_paper: 'Exam papers',
  date_sheet: 'Date sheets',
  mark_sheet: 'Mark sheets',
  marks: 'Marks',
  result: 'Results',
  timetable_slot: 'Timetable',
  notice: 'Notices',
  event: 'Events',
  settings: 'Settings',
  homework: 'Homework',
  staff_attendance: 'Staff attendance',
  complaint: 'Complaints',
  fee_package: 'Fees',
  fee_voucher: 'Fees',
  expense: 'Finance',
}

export function describeModule(module: string): string {
  return AUDIT_MODULE_LABELS[module] ?? module.replace(/_/g, ' ')
}

export type ActivityTone = 'neutral' | 'positive' | 'warning' | 'danger'

/** Colour of the dot next to each entry, so destructive actions stand out. */
export function toneFor(action: string): ActivityTone {
  if (
    action.endsWith('.created') ||
    action.endsWith('.activated') ||
    action.endsWith('.published') ||
    action.endsWith('.submitted') ||
    action.endsWith('.uploaded') ||
    action.endsWith('.generated') ||
    action === 'storage.connected' ||
    action === 'permission.granted'
  ) {
    return 'positive'
  }
  if (
    action.endsWith('.deactivated') ||
    action.endsWith('.deleted') ||
    action.endsWith('.cancelled') ||
    action.endsWith('.withdrawn') ||
    action === 'storage.disconnected' ||
    action === 'permission.revoked' ||
    action === 'auth.login_failed'
  ) {
    return 'danger'
  }
  if (
    action.endsWith('.corrected') ||
    action.endsWith('.status_changed') ||
    action.endsWith('.password_reset') ||
    action.endsWith('.role_changed') ||
    action.endsWith('_revoked') ||
    action === 'permission.override_removed'
  ) {
    return 'warning'
  }
  return 'neutral'
}

/** The raw audit row, as far as the dashboard is allowed to look at it. */
export interface AuditEntryInput {
  id: string
  action: string
  entityType: string
  entityLabel: string | null
  createdAt: Date
  actor: { username: string; fullName: string | null } | null
}

export interface ActivityItem {
  id: string
  /** e.g. "admin" */
  actor: string
  /** e.g. "created the program" */
  description: string
  /** e.g. "I.Com (ICOM)" */
  target: string | null
  action: string
  tone: ActivityTone
  createdAt: Date
}

/**
 * Converts an audit row into a safe, readable line.
 *
 * By construction the result can only ever contain the actor's username, a
 * fixed phrase from the table above, and the entity label — so no password,
 * hash, token or snapshot can reach the dashboard even if one were somehow
 * stored in the audit row.
 */
export function describeAuditEntry(entry: AuditEntryInput): ActivityItem {
  // An unknown future action falls back to a readable version of its name
  // rather than showing a raw key or hiding the event entirely.
  const description = describeAction(entry.action)

  return {
    id: entry.id,
    actor: entry.actor?.fullName ?? entry.actor?.username ?? 'System',
    description,
    target: entry.entityLabel,
    action: entry.action,
    tone: toneFor(entry.action),
    createdAt: entry.createdAt,
  }
}

/** "just now", "5 minutes ago", "3 days ago" — relative to the given moment. */
export function relativeTime(value: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - value.getTime()) / 1000)

  if (seconds < 45) return 'just now'
  if (seconds < 90) return 'a minute ago'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  const months = Math.round(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`

  return `${Math.round(months / 12)} year${Math.round(months / 12) === 1 ? '' : 's'} ago`
}

/* -------------------------------------------------------------------------- */
/* Quick actions                                                              */
/* -------------------------------------------------------------------------- */

export interface QuickActionDefinition {
  key: string
  label: string
  href: string
  /** The permission needed. Undefined means everyone who can see the dashboard. */
  permission?: string
  icon: string
  primary?: boolean
}

/**
 * The shortcuts the dashboard offers. Every entry points at a route that
 * actually exists today — nothing links to an unbuilt module.
 */
export const QUICK_ACTIONS: QuickActionDefinition[] = [
  { key: 'add-user', label: 'Add user account', href: '/admin/users', permission: 'users.manage', icon: 'user-plus', primary: true },
  { key: 'manage-users', label: 'Manage users', href: '/admin/users', permission: 'users.view', icon: 'users' },
  { key: 'programs', label: 'Manage programs', href: '/admin/academics/programs', permission: 'academics.view', icon: 'layers' },
  { key: 'classes', label: 'Manage classes', href: '/admin/academics/classes', permission: 'academics.view', icon: 'graduation-cap' },
  { key: 'divisions', label: 'Manage divisions', href: '/admin/academics/divisions', permission: 'academics.view', icon: 'users-round' },
  { key: 'structure', label: 'Session structure', href: '/admin/academics/structure', permission: 'academics.view', icon: 'layout-dashboard' },
  { key: 'subjects', label: 'Manage subjects', href: '/admin/academics/subjects', permission: 'academics.view', icon: 'book-open' },
  { key: 'curriculum', label: 'Curriculum', href: '/admin/academics/curriculum', permission: 'academics.view', icon: 'scroll-text' },
  { key: 'sessions', label: 'Academic sessions', href: '/admin/academics/sessions', permission: 'academics.view', icon: 'calendar-days' },
  // Phases 4 to 11.
  { key: 'students', label: 'Students', href: '/admin/students', permission: 'students.view', icon: 'graduation-cap' },
  { key: 'staff', label: 'Staff', href: '/admin/staff', permission: 'staff.view', icon: 'user-cog' },
  { key: 'attendance', label: 'Attendance', href: '/admin/attendance', permission: 'attendance.view', icon: 'clipboard-check' },
  { key: 'exams', label: 'Exams & results', href: '/admin/exams', permission: 'exams.view', icon: 'file-text' },
  { key: 'timetable', label: 'Timetable', href: '/admin/timetable', permission: 'timetable.view', icon: 'calendar-days' },
  { key: 'notices', label: 'Write a notice', href: '/admin/notices', permission: 'notices.manage', icon: 'megaphone' },
  { key: 'events', label: 'Events', href: '/admin/events', permission: 'events.view', icon: 'calendar-days' },
]

/**
 * A whole-number percentage, or null when there is nothing to count.
 *
 * Null is not 0%: no attendance taken this month means "no figure yet", and
 * showing 0% would read as "nobody came".
 */
export function percentageOf(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return Math.round((part / whole) * 100)
}

/** Keeps only the shortcuts this particular administrator may actually use. */
export function buildQuickActions(permissions: Set<string>): QuickActionDefinition[] {
  return QUICK_ACTIONS.filter(
    (action) => !action.permission || permissions.has(action.permission),
  )
}

/* -------------------------------------------------------------------------- */
/* Modules that do not exist yet                                              */
/* -------------------------------------------------------------------------- */

export interface UpcomingModule {
  name: string
  phase: number
  description: string
}

/**
 * Shown as an honest "not built yet" list instead of cards with zeros in them.
 * A zero would read as "no attendance was taken today", which would be a lie —
 * attendance does not exist yet.
 */
export const UPCOMING_MODULES: UpcomingModule[] = [
  // Phases 4 to 11 are built. The list is kept, empty, so the dashboard can
  // say so honestly if a later phase adds a module before its figures exist.
]

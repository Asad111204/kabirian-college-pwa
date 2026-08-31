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
 * The full audit viewer arrives in Phase 14.
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
}

export type ActivityTone = 'neutral' | 'positive' | 'warning' | 'danger'

/** Colour of the dot next to each entry, so destructive actions stand out. */
function toneFor(action: string): ActivityTone {
  if (action.endsWith('.created') || action.endsWith('.activated') || action === 'permission.granted') {
    return 'positive'
  }
  if (
    action.endsWith('.deactivated') ||
    action === 'permission.revoked' ||
    action === 'auth.login_failed'
  ) {
    return 'danger'
  }
  if (
    action === 'user.password_reset' ||
    action === 'user.role_changed' ||
    action === 'user.sessions_revoked' ||
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
  const description =
    ACTION_DESCRIPTIONS[entry.action] ??
    // Unknown future action: fall back to a readable version of its name
    // rather than showing a raw key or hiding the event entirely.
    entry.action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')

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
]

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
  { name: 'Student records', phase: 4, description: 'Admissions, enrolment, promotion and transfer' },
  { name: 'Staff records', phase: 5, description: 'Staff profiles and teacher assignments' },
  { name: 'Documents', phase: 6, description: 'Google Drive storage and the document checklist' },
  { name: 'Attendance', phase: 7, description: 'Daily marking, corrections and percentages' },
  { name: 'Exams & marks', phase: 8, description: 'Exam schedules and marks entry' },
  { name: 'Results', phase: 9, description: 'Result generation, grades and publishing' },
  { name: 'Timetable', phase: 10, description: 'Weekly timetable per section' },
  { name: 'Notices & events', phase: 11, description: 'Announcements targeted by audience' },
]

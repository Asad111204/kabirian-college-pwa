/**
 * The permission catalogue and the default permissions of each role.
 *
 * These constants are the *source* used to seed the `permissions` and
 * `role_permissions` tables. At runtime, permission checks read the DATABASE —
 * so an admin can grant or revoke a permission for one person without a code
 * change (see ADR-007). Re-running the reference seed keeps the catalogue in
 * sync when we add new keys in later phases.
 */
import { UserRole } from '@/generated/prisma/enums'

export const PERMISSIONS = {
  // Dashboards
  'dashboard.view': { module: 'dashboard', description: 'See the portal dashboard' },

  // Academic structure
  'academics.view': { module: 'academics', description: 'View sessions, classes, divisions, programs, sections and subjects' },
  'academics.manage': { module: 'academics', description: 'Create and edit the academic structure' },
  'academics.assign_teachers': { module: 'academics', description: 'Assign teachers to sections and subjects' },

  // Students
  'students.view': { module: 'students', description: 'View student records' },
  'students.create': { module: 'students', description: 'Add new students' },
  'students.update': { module: 'students', description: 'Edit student records' },
  'students.delete': { module: 'students', description: 'Deactivate or remove students' },
  'students.enroll': { module: 'students', description: 'Enrol students and change their section' },
  'students.promote': { module: 'students', description: 'Promote students to the next session' },
  'students.export': { module: 'students', description: 'Export student lists' },

  // Staff
  'staff.view': { module: 'staff', description: 'View staff records' },
  'staff.create': { module: 'staff', description: 'Add new staff members' },
  'staff.update': { module: 'staff', description: 'Edit staff records' },
  'staff.delete': { module: 'staff', description: 'Deactivate or remove staff' },
  'staff.assign': { module: 'staff', description: 'Manage staff subject and section assignments' },

  // Attendance (Phase 7)
  'attendance.view': { module: 'attendance', description: 'View attendance' },
  'attendance.create': { module: 'attendance', description: 'Mark and submit attendance' },
  'attendance.update': { module: 'attendance', description: 'Correct attendance before submission' },
  'attendance.update_submitted': { module: 'attendance', description: 'Correct attendance after submission' },

  // Exams & marks (Phase 8)
  'exams.view': { module: 'exams', description: 'View exams and exam schedules' },
  'exams.manage': { module: 'exams', description: 'Create and edit exams' },
  'marks.view': { module: 'marks', description: 'View marks' },
  'marks.enter': { module: 'marks', description: 'Enter marks' },
  'marks.update': { module: 'marks', description: 'Edit marks before submission' },
  'marks.update_submitted': { module: 'marks', description: 'Edit marks after submission' },

  // Results (Phase 9)
  'results.view': { module: 'results', description: 'View results' },
  'results.generate': { module: 'results', description: 'Generate results' },
  'results.publish': { module: 'results', description: 'Publish and unpublish results' },

  // Timetable (Phase 10)
  'timetable.view': { module: 'timetable', description: 'View timetables' },
  'timetable.manage': { module: 'timetable', description: 'Create and edit timetables' },

  // Notices & events (Phase 11)
  'notices.view': { module: 'notices', description: 'View notices' },
  'notices.manage': { module: 'notices', description: 'Create and publish notices' },
  'events.view': { module: 'events', description: 'View events' },
  'events.manage': { module: 'events', description: 'Create and edit events' },

  // Documents (Phase 6)
  'documents.view': { module: 'documents', description: 'View documents' },
  'documents.upload': { module: 'documents', description: 'Upload documents' },
  'documents.replace': { module: 'documents', description: 'Replace documents' },
  'documents.delete': { module: 'documents', description: 'Delete documents' },
  'documents.view_sensitive': { module: 'documents', description: 'View sensitive identity documents (CNIC, B-Form)' },

  // Reports (Phase 13)
  'reports.generate': { module: 'reports', description: 'Generate and export reports' },

  // Users & system
  'users.view': { module: 'users', description: 'View user accounts' },
  'users.manage': { module: 'users', description: 'Create accounts, reset passwords, activate/deactivate' },
  'permissions.manage': { module: 'users', description: 'Grant or revoke individual permissions' },
  'audit.view': { module: 'system', description: 'View the audit log' },
  'settings.manage': { module: 'system', description: 'Change system settings' },
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]

/** Every permission an ADMIN holds by default: all of them. */
const ADMIN_PERMISSIONS: PermissionKey[] = [...ALL_PERMISSION_KEYS]

/**
 * A teacher's defaults. Note these are only "may they do X" — *which* students
 * and sections they may touch is decided separately by their assignments
 * (see authorize.ts, scope checks).
 */
const STAFF_PERMISSIONS: PermissionKey[] = [
  'dashboard.view',
  'academics.view',
  'students.view',
  'attendance.view',
  'attendance.create',
  'attendance.update',
  'exams.view',
  'marks.view',
  'marks.enter',
  'marks.update',
  'results.view',
  'timetable.view',
  'notices.view',
  'events.view',
  'documents.view',
]

/** A student can only ever read, and only their own data. */
const STUDENT_PERMISSIONS: PermissionKey[] = [
  'dashboard.view',
  'attendance.view',
  'exams.view',
  'marks.view',
  'results.view',
  'timetable.view',
  'notices.view',
  'events.view',
  'documents.view',
]

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  [UserRole.ADMIN]: ADMIN_PERMISSIONS,
  [UserRole.STAFF]: STAFF_PERMISSIONS,
  [UserRole.STUDENT]: STUDENT_PERMISSIONS,
}

/**
 * Works out what a user may actually do:
 *   role defaults + individual GRANTs − individual REVOKEs
 */
export function resolveEffectivePermissions(
  rolePermissions: string[],
  overrides: { permissionKey: string; effect: 'GRANT' | 'REVOKE' }[],
): Set<string> {
  const effective = new Set(rolePermissions)

  for (const override of overrides) {
    if (override.effect === 'GRANT') effective.add(override.permissionKey)
    else effective.delete(override.permissionKey)
  }

  return effective
}

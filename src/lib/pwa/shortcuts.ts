/**
 * Home-screen shortcuts ("Attendance", "Timetable", "Notices") are the same
 * for everyone who installs the app, but each role's page lives under its own
 * portal. `/go/<target>` resolves the target for the signed-in role; a role
 * without that screen lands on its dashboard.
 */
export const SHORTCUT_TARGETS = ['attendance', 'timetable', 'notices', 'results'] as const
export type ShortcutTarget = (typeof SHORTCUT_TARGETS)[number]

type Role = 'ADMIN' | 'STAFF' | 'STUDENT'

const PAGES: Record<ShortcutTarget, Record<Role, string>> = {
  attendance: { ADMIN: '/admin/attendance', STAFF: '/staff/attendance', STUDENT: '/student/attendance' },
  timetable: { ADMIN: '/admin/timetable', STAFF: '/staff/timetable', STUDENT: '/student' },
  notices: { ADMIN: '/admin/notices', STAFF: '/staff/notices', STUDENT: '/student/notices' },
  results: { ADMIN: '/admin/exams', STAFF: '/staff/results', STUDENT: '/student/results' },
}

export function isShortcutTarget(value: string): value is ShortcutTarget {
  return (SHORTCUT_TARGETS as readonly string[]).includes(value)
}

export function shortcutPath(target: ShortcutTarget, role: Role): string {
  return PAGES[target][role]
}

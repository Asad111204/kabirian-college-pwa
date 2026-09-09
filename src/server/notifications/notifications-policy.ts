/**
 * Notifications: what each kind is called, where its red dot goes, and how a
 * badge is counted.
 *
 * Pure functions, no database. The kind is the *module* rather than the exact
 * event, because the kind is also what decides which button in the menu wears
 * a dot: a new notice and an edited notice are both "Notices" to somebody
 * looking at the sidebar.
 */

export const NOTIFICATION_KINDS = ['NOTICE', 'EVENT', 'HOMEWORK', 'EXAM', 'RESULT', 'COMPLAINT', 'FEE'] as const
export type NotificationKindValue = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_KIND_LABEL: Record<NotificationKindValue, string> = {
  NOTICE: 'Notices',
  EVENT: 'Events',
  HOMEWORK: 'Homework',
  EXAM: 'Exams',
  RESULT: 'Results',
  COMPLAINT: 'Complaints',
  FEE: 'Fees',
}

/**
 * Which menu entries a kind lights up, per portal.
 *
 * A path here is matched against the start of the menu item's own path, so
 * `/student/complaints` lights up the student's "Write to the Office" and
 * `/admin/complaints` the office's "Complaints", from the same kind.
 */
export const NOTIFICATION_KIND_PATHS: Record<NotificationKindValue, string[]> = {
  NOTICE: ['/admin/notices', '/staff/notices', '/student/notices'],
  EVENT: ['/admin/events', '/staff/events', '/student/events'],
  HOMEWORK: ['/admin/homework', '/staff/homework', '/student/homework'],
  EXAM: ['/admin/exams', '/staff/exams', '/student/results'],
  RESULT: ['/admin/results', '/staff/results', '/student/results'],
  COMPLAINT: ['/admin/complaints', '/student/complaints'],
  FEE: ['/admin/fees', '/student/fees'],
}

/** How many unread notifications are left in each part of the college. */
export type UnreadByKind = Partial<Record<NotificationKindValue, number>>

/**
 * Does this menu entry deserve a red dot?
 *
 * True when anything unread belongs to a kind whose paths include this one.
 * The comparison is by prefix, so "/student/homework" lights up for a
 * notification pointing at "/student/homework/abc".
 */
export function hasDotFor(href: string, unread: UnreadByKind): boolean {
  return countFor(href, unread) > 0
}

/** How many unread notifications belong to this menu entry. */
export function countFor(href: string, unread: UnreadByKind): number {
  let total = 0
  for (const kind of NOTIFICATION_KINDS) {
    const count = unread[kind] ?? 0
    if (count === 0) continue
    if (NOTIFICATION_KIND_PATHS[kind].some((path) => path === href)) total += count
  }
  return total
}

/** Everything unread, for the bell and for the icon on the home screen. */
export function totalUnread(unread: UnreadByKind): number {
  return NOTIFICATION_KINDS.reduce((sum, kind) => sum + (unread[kind] ?? 0), 0)
}

/**
 * What the badge on the app icon should say.
 *
 * Above ninety-nine it stays at ninety-nine: the platform draws a small
 * circle, and an exact number nobody can read is worse than a number that
 * says "a lot".
 */
export function badgeCount(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(99, Math.trunc(total))
}

/**
 * Only ever somewhere inside this app.
 *
 * A notification carries a link, and a link is the one part of it that could
 * take somebody off the site. The database refuses anything else too; this is
 * the same rule where the row is written.
 */
export function isInternalLink(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//')
}

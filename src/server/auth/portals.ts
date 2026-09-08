/**
 * Which portals an account may work in, and which one it is working in now.
 *
 * Pure functions, no database. The college asked for one thing here: a member
 * of staff who is also an administrator should have **one account**, not two,
 * and should be able to move between the staff portal and the office portal
 * without signing out. Students stay single-role, and an administrator's
 * account is unchanged.
 *
 * The idea that makes the rest of the system survive this: an account has a
 * set of portals it *may* use, and exactly one it *is* using. The one it is
 * using is the role everything else in the codebase already means by
 * `ctx.role` — so a principal working in the staff portal is a teacher, with
 * a teacher's permissions and a teacher's scope, and the same person in the
 * office portal is the office. Nothing else had to learn about this phase.
 *
 * The switch is a convenience, not a security boundary: somebody who may use
 * both portals can always move to the other one. The boundary is the set.
 */
import type { UserRole } from '@/generated/prisma/enums'

export const PORTAL_LABEL: Record<UserRole, string> = {
  ADMIN: 'Office',
  STAFF: 'Staff',
  STUDENT: 'Student',
}

/** Where each portal starts. */
export function portalPathFor(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'STAFF':
      return '/staff'
    case 'STUDENT':
      return '/student'
    default:
      return '/'
  }
}

export interface PortalAccount {
  /** The account's own role: what it is, before any switching. */
  role: UserRole
  /** Office access held in addition to STAFF (Phase 24). */
  adminAccess: boolean
}

/**
 * Every portal this account may work in, in the order they should be offered.
 *
 * The account's own role comes first, because that is what it is; office
 * access is something added on top. `adminAccess` outside STAFF is ignored
 * rather than trusted — an ADMIN already has the office, a student never
 * does, and the database refuses the combination anyway.
 */
export function portalsFor(account: PortalAccount): UserRole[] {
  if (account.role === 'STAFF' && account.adminAccess) return ['STAFF', 'ADMIN']
  return [account.role]
}

/** Does this account hold more than one portal, so a switcher is worth showing? */
export function hasMultiplePortals(account: PortalAccount): boolean {
  return portalsFor(account).length > 1
}

export function canUsePortal(account: PortalAccount, role: UserRole): boolean {
  return portalsFor(account).includes(role)
}

/**
 * Which portal a request is actually in.
 *
 * `stored` is what the device last switched to. It is checked against the set
 * every time rather than trusted, so the moment office access is taken away,
 * a session that was in the office portal falls back to the staff portal —
 * without anybody having to remember to end that session.
 */
export function resolveActivePortal(account: PortalAccount, stored: UserRole | null | undefined): UserRole {
  if (stored && canUsePortal(account, stored)) return stored
  return account.role
}

export type SwitchDecision = { allowed: true } | { allowed: false; reason: string }

/** May this account move to that portal? */
export function decideCanSwitchPortal(account: PortalAccount, to: UserRole, current: UserRole): SwitchDecision {
  if (!canUsePortal(account, to)) {
    return { allowed: false, reason: 'Your account does not have access to that portal.' }
  }
  if (to === current) {
    return { allowed: false, reason: `You are already working in the ${PORTAL_LABEL[to].toLowerCase()} portal.` }
  }
  return { allowed: true }
}

export type AdminAccessDecision = { allowed: true } | { allowed: false; reason: string }

/**
 * May office access be given to, or taken from, this account?
 *
 * Only a staff account: an administrator already has the office, and a student
 * never does. Giving it to yourself is not possible in practice — it needs
 * `users.manage`, which no staff account holds — but the rule is written down
 * rather than inferred, because "in practice" is how privilege escalation
 * happens.
 */
export function decideCanSetAdminAccess(
  actor: { userId: string },
  target: { userId: string; role: UserRole; isSystemOwner: boolean },
  next: boolean,
  current: boolean,
): AdminAccessDecision {
  if (target.role !== 'STAFF') {
    const why =
      target.role === 'ADMIN'
        ? 'That account is already an administrator.'
        : 'Only a member of staff can be given office access. A student account never can.'
    return { allowed: false, reason: why }
  }
  if (target.userId === actor.userId) {
    return { allowed: false, reason: 'You cannot change your own office access. Ask another administrator.' }
  }
  if (next === current) {
    return { allowed: false, reason: next ? 'That account already has office access.' : 'That account does not have office access.' }
  }
  return { allowed: true }
}

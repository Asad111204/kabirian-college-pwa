/**
 * Safety rules for account management.
 *
 * These stop an administrator from locking the college out of its own system —
 * by deactivating the last administrator, by removing their own access, or by
 * demoting the protected owner account.
 *
 * They are written as pure functions (no database, no request) so every rule
 * can be unit-tested on its own, and so the reason for each rule stays readable.
 */
import { ConflictError, ForbiddenError } from '../api/errors'
import type { UserRole, UserStatus } from '@/generated/prisma/enums'

/** The minimum an account must tell us before we can judge a change to it. */
export interface UserSafetySubject {
  id: string
  username: string
  role: UserRole
  status: UserStatus
  isSystemOwner: boolean
}

export interface SafetyContext {
  /** The administrator performing the action. */
  actorUserId: string
  /**
   * How many ACTIVE users with the ADMIN role exist right now, including the
   * target. If this is 1 and the target is that admin, the college would be
   * locked out by the change.
   */
  activeAdminCount: number
}

/** The account is the protected owner; some changes are never allowed on it. */
function assertNotSystemOwner(target: UserSafetySubject, action: string): void {
  if (target.isSystemOwner) {
    throw new ForbiddenError(
      `"${target.username}" is the protected system owner account and cannot be ${action}. ` +
        `Create another administrator first if you need to change this.`,
    )
  }
}

/**
 * Deactivating an account.
 * Blocked when: it is you, it is the owner account, or it is the last admin.
 */
export function assertCanChangeStatus(
  ctx: SafetyContext,
  target: UserSafetySubject,
  nextStatus: UserStatus,
): void {
  if (nextStatus === target.status) return // nothing to do
  if (nextStatus === 'ACTIVE') return // activating is always safe

  if (target.id === ctx.actorUserId) {
    throw new ConflictError(
      'You cannot deactivate your own account. Ask another administrator to do it.',
    )
  }

  assertNotSystemOwner(target, 'deactivated')

  if (target.role === 'ADMIN' && ctx.activeAdminCount <= 1) {
    throw new ConflictError(
      `"${target.username}" is the only active administrator. ` +
        `Create or activate another administrator before deactivating this one.`,
    )
  }
}

/**
 * Changing someone's role.
 * Blocked when: it is you, it is the owner account, or it would remove the last
 * remaining administrator.
 */
export function assertCanChangeRole(
  ctx: SafetyContext,
  target: UserSafetySubject,
  nextRole: UserRole,
): void {
  if (nextRole === target.role) return

  if (target.id === ctx.actorUserId) {
    throw new ConflictError(
      'You cannot change your own role. Ask another administrator to do it.',
    )
  }

  assertNotSystemOwner(target, 'given a different role')

  const isLosingAdmin = target.role === 'ADMIN' && nextRole !== 'ADMIN'
  if (isLosingAdmin && target.status === 'ACTIVE' && ctx.activeAdminCount <= 1) {
    throw new ConflictError(
      `"${target.username}" is the only active administrator. ` +
        `Make someone else an administrator first.`,
    )
  }
}

/**
 * Permissions that an administrator must keep in order to manage the system.
 * Revoking these from the last admin — or from yourself — would be a one-way door.
 */
export const CRITICAL_ADMIN_PERMISSIONS = ['users.view', 'users.manage', 'permissions.manage']

/**
 * Changing one user's permission overrides.
 *
 * `revokedKeys` is the set of permissions that will be REVOKE overrides after
 * the change.
 */
export function assertCanChangePermissions(
  ctx: SafetyContext,
  target: UserSafetySubject,
  revokedKeys: string[],
): void {
  const revokingCritical = revokedKeys.filter((key) => CRITICAL_ADMIN_PERMISSIONS.includes(key))
  if (revokingCritical.length === 0) return

  if (target.id === ctx.actorUserId) {
    throw new ConflictError(
      `You cannot remove your own ${revokingCritical.join(', ')} permission — ` +
        `you would immediately lose access to user management.`,
    )
  }

  if (target.isSystemOwner) {
    throw new ForbiddenError(
      `"${target.username}" is the protected system owner account; its ` +
        `${revokingCritical.join(', ')} permission cannot be removed.`,
    )
  }

  if (target.role === 'ADMIN' && target.status === 'ACTIVE' && ctx.activeAdminCount <= 1) {
    throw new ConflictError(
      `"${target.username}" is the only active administrator. Removing ` +
        `${revokingCritical.join(', ')} would leave nobody able to manage the system.`,
    )
  }
}

/**
 * Resetting a password is allowed for anyone, including yourself — but doing it
 * to yourself signs you out, so the UI warns first. The owner account may only
 * be reset by itself or by another administrator, which is already the case.
 */
export function assertCanResetPassword(_ctx: SafetyContext, _target: UserSafetySubject): void {
  // No blocking rule today. The function exists so the rule has one home if the
  // college later decides, for example, that the owner account is reset-protected.
}

/** Deleting accounts is not supported at all — deactivation preserves history. */
export function accountsAreNeverDeleted(): never {
  throw new ConflictError(
    'User accounts are never deleted, because attendance, marks and audit records ' +
      'refer to them. Deactivate the account instead — the person can no longer sign ' +
      'in, and every historical record stays intact.',
  )
}

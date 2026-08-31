import { describe, expect, it } from 'vitest'
import {
  assertCanChangePermissions,
  assertCanChangeRole,
  assertCanChangeStatus,
  accountsAreNeverDeleted,
  CRITICAL_ADMIN_PERMISSIONS,
  type SafetyContext,
  type UserSafetySubject,
} from '@/server/services/user-safety'
import { ConflictError, ForbiddenError } from '@/server/api/errors'

const ACTOR_ID = '018f0000-0000-7000-8000-00000000a001'
const OTHER_ID = '018f0000-0000-7000-8000-00000000a002'

function subject(overrides: Partial<UserSafetySubject> = {}): UserSafetySubject {
  return {
    id: OTHER_ID,
    username: 'someone',
    role: 'STAFF',
    status: 'ACTIVE',
    isSystemOwner: false,
    ...overrides,
  }
}

function ctx(activeAdminCount = 3): SafetyContext {
  return { actorUserId: ACTOR_ID, activeAdminCount }
}

describe('deactivating an account', () => {
  it('allows deactivating an ordinary staff account', () => {
    expect(() => assertCanChangeStatus(ctx(), subject(), 'INACTIVE')).not.toThrow()
  })

  it('always allows activating', () => {
    expect(() =>
      assertCanChangeStatus(ctx(1), subject({ status: 'INACTIVE', role: 'ADMIN' }), 'ACTIVE'),
    ).not.toThrow()
  })

  it('does nothing when the status is unchanged', () => {
    expect(() => assertCanChangeStatus(ctx(1), subject({ role: 'ADMIN' }), 'ACTIVE')).not.toThrow()
  })

  it('refuses to let an administrator deactivate themselves', () => {
    expect(() =>
      assertCanChangeStatus(ctx(), subject({ id: ACTOR_ID, role: 'ADMIN' }), 'INACTIVE'),
    ).toThrow(ConflictError)
  })

  it('protects the system owner account', () => {
    expect(() =>
      assertCanChangeStatus(ctx(), subject({ isSystemOwner: true, role: 'ADMIN' }), 'INACTIVE'),
    ).toThrow(ForbiddenError)
  })

  it('refuses to deactivate the only active administrator', () => {
    expect(() => assertCanChangeStatus(ctx(1), subject({ role: 'ADMIN' }), 'INACTIVE')).toThrow(
      /only active administrator/i,
    )
  })

  it('allows deactivating an administrator when others remain', () => {
    expect(() => assertCanChangeStatus(ctx(2), subject({ role: 'ADMIN' }), 'INACTIVE')).not.toThrow()
  })

  it('does not apply the last-admin rule to staff or students', () => {
    expect(() => assertCanChangeStatus(ctx(1), subject({ role: 'STAFF' }), 'INACTIVE')).not.toThrow()
    expect(() => assertCanChangeStatus(ctx(1), subject({ role: 'STUDENT' }), 'INACTIVE')).not.toThrow()
  })
})

describe('changing a role', () => {
  it('allows promoting a staff member to administrator', () => {
    expect(() => assertCanChangeRole(ctx(), subject({ role: 'STAFF' }), 'ADMIN')).not.toThrow()
  })

  it('does nothing when the role is unchanged', () => {
    expect(() =>
      assertCanChangeRole(ctx(1), subject({ id: ACTOR_ID, role: 'ADMIN' }), 'ADMIN'),
    ).not.toThrow()
  })

  it('refuses to let an administrator change their own role', () => {
    expect(() => assertCanChangeRole(ctx(), subject({ id: ACTOR_ID, role: 'ADMIN' }), 'STAFF')).toThrow(
      /your own role/i,
    )
  })

  it('protects the system owner account', () => {
    expect(() =>
      assertCanChangeRole(ctx(), subject({ isSystemOwner: true, role: 'ADMIN' }), 'STAFF'),
    ).toThrow(ForbiddenError)
  })

  it('refuses to demote the only active administrator', () => {
    expect(() => assertCanChangeRole(ctx(1), subject({ role: 'ADMIN' }), 'STAFF')).toThrow(
      /only active administrator/i,
    )
  })

  it('allows demoting an administrator when others remain', () => {
    expect(() => assertCanChangeRole(ctx(2), subject({ role: 'ADMIN' }), 'STAFF')).not.toThrow()
  })

  it('allows demoting an already-inactive administrator even if counts are low', () => {
    expect(() =>
      assertCanChangeRole(ctx(1), subject({ role: 'ADMIN', status: 'INACTIVE' }), 'STAFF'),
    ).not.toThrow()
  })
})

describe('changing permission overrides', () => {
  it('allows ordinary permission changes', () => {
    expect(() =>
      assertCanChangePermissions(ctx(), subject(), ['attendance.update_submitted']),
    ).not.toThrow()
  })

  it('allows an empty revoke list', () => {
    expect(() => assertCanChangePermissions(ctx(1), subject({ role: 'ADMIN' }), [])).not.toThrow()
  })

  it('stops an administrator removing their own user-management access', () => {
    expect(() =>
      assertCanChangePermissions(ctx(), subject({ id: ACTOR_ID, role: 'ADMIN' }), ['users.manage']),
    ).toThrow(/your own/i)
  })

  it('protects the system owner from losing critical permissions', () => {
    expect(() =>
      assertCanChangePermissions(ctx(), subject({ isSystemOwner: true, role: 'ADMIN' }), [
        'permissions.manage',
      ]),
    ).toThrow(ForbiddenError)
  })

  it('stops the last administrator losing critical permissions', () => {
    expect(() =>
      assertCanChangePermissions(ctx(1), subject({ role: 'ADMIN' }), ['users.manage']),
    ).toThrow(/only active administrator/i)
  })

  it('guards every permission on the critical list', () => {
    for (const key of CRITICAL_ADMIN_PERMISSIONS) {
      expect(
        () => assertCanChangePermissions(ctx(), subject({ id: ACTOR_ID, role: 'ADMIN' }), [key]),
        `${key} should be protected`,
      ).toThrow()
    }
  })

  it('ignores revokes of non-critical permissions for the last admin', () => {
    expect(() =>
      assertCanChangePermissions(ctx(1), subject({ role: 'ADMIN' }), ['notices.manage']),
    ).not.toThrow()
  })
})

describe('deleting accounts', () => {
  it('is never allowed, and explains why', () => {
    expect(() => accountsAreNeverDeleted()).toThrow(/never deleted/i)
    expect(() => accountsAreNeverDeleted()).toThrow(ConflictError)
  })
})

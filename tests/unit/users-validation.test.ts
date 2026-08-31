import { describe, expect, it } from 'vitest'
import {
  userCreateSchema,
  userListQuerySchema,
  userPermissionsSchema,
  userRoleSchema,
  userStatusSchema,
  userUpdateSchema,
} from '@/validation/users'

const UUID = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d8e9f'
const OTHER_UUID = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d8ea0'

describe('creating a user', () => {
  it('accepts a valid staff account', () => {
    const result = userCreateSchema.safeParse({
      fullName: 'Muhammad Ali',
      username: 'muhammad.ali',
      role: 'STAFF',
    })
    expect(result.success).toBe(true)
  })

  it('lowercases the username so logins are case-insensitive', () => {
    const result = userCreateSchema.parse({
      fullName: 'Muhammad Ali',
      username: 'Muhammad.ALI',
      role: 'STAFF',
    })
    expect(result.username).toBe('muhammad.ali')
  })

  it('rejects a username with spaces or unusual characters', () => {
    for (const username of ['muhammad ali', 'ali@college', 'ali/admin', 'ali#1']) {
      expect(
        userCreateSchema.safeParse({ fullName: 'X Y', username, role: 'STAFF' }).success,
        `${username} should be rejected`,
      ).toBe(false)
    }
  })

  it('rejects a username that is too short', () => {
    expect(userCreateSchema.safeParse({ fullName: 'X Y', username: 'ab', role: 'STAFF' }).success).toBe(
      false,
    )
  })

  it('requires a full name', () => {
    expect(userCreateSchema.safeParse({ fullName: '', username: 'someone', role: 'STAFF' }).success).toBe(
      false,
    )
  })

  it('rejects an unknown role', () => {
    expect(
      userCreateSchema.safeParse({ fullName: 'X Y', username: 'someone', role: 'SUPERADMIN' }).success,
    ).toBe(false)
  })

  it('defaults new accounts to active', () => {
    expect(
      userCreateSchema.parse({ fullName: 'X Y', username: 'someone', role: 'STAFF' }).status,
    ).toBe('ACTIVE')
  })

  it('treats an empty email as no email', () => {
    const result = userCreateSchema.parse({
      fullName: 'X Y',
      username: 'someone',
      role: 'STAFF',
      email: '',
    })
    expect(result.email).toBeUndefined()
  })

  it('rejects a malformed email', () => {
    expect(
      userCreateSchema.safeParse({
        fullName: 'X Y',
        username: 'someone',
        role: 'STAFF',
        email: 'not-an-email',
      }).success,
    ).toBe(false)
  })

  it('refuses to link one account to both a staff and a student record', () => {
    const result = userCreateSchema.safeParse({
      fullName: 'X Y',
      username: 'someone',
      role: 'STAFF',
      staffId: UUID,
      studentId: OTHER_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('refuses to link an administrator to a staff or student record', () => {
    expect(
      userCreateSchema.safeParse({
        fullName: 'X Y',
        username: 'someone',
        role: 'ADMIN',
        staffId: UUID,
      }).success,
    ).toBe(false)
  })

  it('refuses a staff account linked to a student record', () => {
    expect(
      userCreateSchema.safeParse({
        fullName: 'X Y',
        username: 'someone',
        role: 'STAFF',
        studentId: UUID,
      }).success,
    ).toBe(false)
  })

  it('refuses a student account linked to a staff record', () => {
    expect(
      userCreateSchema.safeParse({
        fullName: 'X Y',
        username: 'someone',
        role: 'STUDENT',
        staffId: UUID,
      }).success,
    ).toBe(false)
  })

  it('accepts a staff account correctly linked to a staff record', () => {
    expect(
      userCreateSchema.safeParse({
        fullName: 'X Y',
        username: 'someone',
        role: 'STAFF',
        staffId: UUID,
      }).success,
    ).toBe(true)
  })

  it('never accepts a password field — passwords are always generated', () => {
    const result = userCreateSchema.parse({
      fullName: 'X Y',
      username: 'someone',
      role: 'STAFF',
      password: 'attacker-chosen',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('password')
  })
})

describe('updating a user', () => {
  it('accepts a normal edit', () => {
    expect(
      userUpdateSchema.safeParse({
        fullName: 'Muhammad Ali Khan',
        username: 'muhammad.ali',
        email: 'ali@example.com',
      }).success,
    ).toBe(true)
  })

  it('does not allow the role or status to be changed here', () => {
    const result = userUpdateSchema.parse({
      fullName: 'X Y',
      username: 'someone',
      role: 'ADMIN',
      status: 'ACTIVE',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('role')
    expect(result).not.toHaveProperty('status')
  })
})

describe('status and role changes', () => {
  it('accepts the two real statuses', () => {
    expect(userStatusSchema.safeParse({ status: 'ACTIVE' }).success).toBe(true)
    expect(userStatusSchema.safeParse({ status: 'INACTIVE' }).success).toBe(true)
  })

  it('rejects a made-up status', () => {
    expect(userStatusSchema.safeParse({ status: 'DELETED' }).success).toBe(false)
    expect(userStatusSchema.safeParse({ status: 'LOCKED' }).success).toBe(false)
  })

  it('accepts the three real roles and nothing else', () => {
    for (const role of ['ADMIN', 'STAFF', 'STUDENT']) {
      expect(userRoleSchema.safeParse({ role }).success, role).toBe(true)
    }
    expect(userRoleSchema.safeParse({ role: 'PARENT' }).success).toBe(false)
  })
})

describe('permission overrides', () => {
  it('accepts grants and revokes', () => {
    const result = userPermissionsSchema.safeParse({
      overrides: [
        { permissionKey: 'attendance.update_submitted', effect: 'GRANT' },
        { permissionKey: 'students.view', effect: 'REVOKE' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty list, meaning "follow the role for everything"', () => {
    expect(userPermissionsSchema.safeParse({ overrides: [] }).success).toBe(true)
  })

  it('rejects an effect that is not GRANT or REVOKE', () => {
    expect(
      userPermissionsSchema.safeParse({
        overrides: [{ permissionKey: 'students.view', effect: 'MAYBE' }],
      }).success,
    ).toBe(false)
  })
})

describe('user list query', () => {
  it('falls back to sensible defaults', () => {
    const result = userListQuerySchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.role).toBe('ALL')
    expect(result.status).toBe('ALL')
    expect(result.sort).toBe('createdAt')
  })

  it('caps the page size so nobody can request the whole table', () => {
    expect(userListQuerySchema.safeParse({ pageSize: 5000 }).success).toBe(false)
    expect(userListQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50)
  })

  it('only allows sorting by known columns', () => {
    expect(userListQuerySchema.safeParse({ sort: 'passwordHash' }).success).toBe(false)
    expect(userListQuerySchema.safeParse({ sort: 'username' }).success).toBe(true)
  })

  it('supports filtering by the locked state', () => {
    expect(userListQuerySchema.parse({ status: 'LOCKED' }).status).toBe('LOCKED')
  })
})

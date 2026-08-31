import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  resolveEffectivePermissions,
} from '@/server/auth/permissions'

describe('permission catalogue', () => {
  it('gives every permission a module and a description', () => {
    for (const [key, meta] of Object.entries(PERMISSIONS)) {
      expect(meta.module, `${key} needs a module`).toBeTruthy()
      expect(meta.description, `${key} needs a description`).toBeTruthy()
    }
  })

  it('names permissions consistently as module.verb', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      expect(key, `${key} should look like "module.verb"`).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })
})

describe('role defaults', () => {
  it('gives ADMIN every permission', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toHaveLength(ALL_PERMISSION_KEYS.length)
  })

  it('never gives STUDENT a write permission', () => {
    const writeVerbs = ['create', 'update', 'delete', 'manage', 'enter', 'publish', 'generate', 'assign', 'enroll', 'promote', 'upload', 'replace']
    for (const key of ROLE_DEFAULT_PERMISSIONS.STUDENT) {
      const verb = key.split('.')[1] ?? ''
      expect(writeVerbs, `students must not hold ${key}`).not.toContain(verb)
    }
  })

  it('never gives STAFF administrative permissions', () => {
    const forbidden = [
      'users.manage',
      'permissions.manage',
      'audit.view',
      'settings.manage',
      'academics.manage',
      'students.delete',
      'results.publish',
      'marks.update_submitted',
      'attendance.update_submitted',
    ]
    for (const key of forbidden) {
      expect(ROLE_DEFAULT_PERMISSIONS.STAFF, `staff must not hold ${key}`).not.toContain(key)
    }
  })

  it('lists only permissions that exist in the catalogue', () => {
    for (const keys of Object.values(ROLE_DEFAULT_PERMISSIONS)) {
      for (const key of keys) {
        expect(ALL_PERMISSION_KEYS).toContain(key)
      }
    }
  })
})

describe('resolveEffectivePermissions', () => {
  it('returns the role defaults when there are no overrides', () => {
    const result = resolveEffectivePermissions(['students.view', 'attendance.view'], [])
    expect([...result].sort()).toEqual(['attendance.view', 'students.view'])
  })

  it('adds an individually granted permission', () => {
    const result = resolveEffectivePermissions(
      ['attendance.view'],
      [{ permissionKey: 'attendance.update_submitted', effect: 'GRANT' }],
    )
    expect(result.has('attendance.update_submitted')).toBe(true)
  })

  it('removes an individually revoked permission', () => {
    const result = resolveEffectivePermissions(
      ['students.view', 'students.update'],
      [{ permissionKey: 'students.update', effect: 'REVOKE' }],
    )
    expect(result.has('students.update')).toBe(false)
    expect(result.has('students.view')).toBe(true)
  })

  it('lets a REVOKE win over the role default even for an admin', () => {
    const result = resolveEffectivePermissions(
      [...ROLE_DEFAULT_PERMISSIONS.ADMIN],
      [{ permissionKey: 'results.publish', effect: 'REVOKE' }],
    )
    expect(result.has('results.publish')).toBe(false)
  })
})

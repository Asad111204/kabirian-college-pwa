import { describe, expect, it } from 'vitest'
import {
  PORTAL_LABEL,
  canUsePortal,
  decideCanSetAdminAccess,
  decideCanSwitchPortal,
  hasMultiplePortals,
  portalPathFor,
  portalsFor,
  resolveActivePortal,
} from '@/server/auth/portals'

/**
 * Phase 24. One account, both portals — but only for a member of staff, and
 * only what the account actually holds, checked on every request rather than
 * remembered from the last switch.
 */
const staff = { role: 'STAFF' as const, adminAccess: false }
const staffAdmin = { role: 'STAFF' as const, adminAccess: true }
const admin = { role: 'ADMIN' as const, adminAccess: false }
const student = { role: 'STUDENT' as const, adminAccess: false }

describe('which portals an account holds', () => {
  it('gives almost everybody exactly one', () => {
    expect(portalsFor(staff)).toEqual(['STAFF'])
    expect(portalsFor(admin)).toEqual(['ADMIN'])
    expect(portalsFor(student)).toEqual(['STUDENT'])
    expect(hasMultiplePortals(staff)).toBe(false)
  })

  it('gives a staff member with office access both, their own first', () => {
    expect(portalsFor(staffAdmin)).toEqual(['STAFF', 'ADMIN'])
    expect(hasMultiplePortals(staffAdmin)).toBe(true)
    expect(canUsePortal(staffAdmin, 'ADMIN')).toBe(true)
    expect(canUsePortal(staffAdmin, 'STUDENT')).toBe(false)
  })

  it('ignores office access on an account that is not staff', () => {
    // The database refuses the combination; the policy does not depend on it.
    expect(portalsFor({ role: 'STUDENT', adminAccess: true })).toEqual(['STUDENT'])
    expect(portalsFor({ role: 'ADMIN', adminAccess: true })).toEqual(['ADMIN'])
    expect(canUsePortal({ role: 'STUDENT', adminAccess: true }, 'ADMIN')).toBe(false)
  })
})

describe('which portal a request is in', () => {
  it('is the account’s own when nothing was switched to', () => {
    expect(resolveActivePortal(staff, null)).toBe('STAFF')
    expect(resolveActivePortal(staffAdmin, null)).toBe('STAFF')
    expect(resolveActivePortal(admin, undefined)).toBe('ADMIN')
  })

  it('is what the device switched to, when the account still holds it', () => {
    expect(resolveActivePortal(staffAdmin, 'ADMIN')).toBe('ADMIN')
    expect(resolveActivePortal(staffAdmin, 'STAFF')).toBe('STAFF')
  })

  it('falls back the moment the access is taken away', () => {
    // The session still says ADMIN; the account no longer does. The set wins,
    // so nobody has to remember to end that session.
    expect(resolveActivePortal(staff, 'ADMIN')).toBe('STAFF')
    expect(resolveActivePortal(student, 'ADMIN')).toBe('STUDENT')
    expect(resolveActivePortal(admin, 'STUDENT')).toBe('ADMIN')
  })
})

describe('switching', () => {
  it('lets a two-portal account move to the other one', () => {
    expect(decideCanSwitchPortal(staffAdmin, 'ADMIN', 'STAFF').allowed).toBe(true)
    expect(decideCanSwitchPortal(staffAdmin, 'STAFF', 'ADMIN').allowed).toBe(true)
  })

  it('refuses a portal the account does not hold', () => {
    const decision = decideCanSwitchPortal(staff, 'ADMIN', 'STAFF')
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/does not have access/)
    expect(decideCanSwitchPortal(admin, 'STAFF', 'ADMIN').allowed).toBe(false)
    expect(decideCanSwitchPortal(student, 'ADMIN', 'STUDENT').allowed).toBe(false)
  })

  it('says so rather than pretending, when they are already there', () => {
    const decision = decideCanSwitchPortal(staffAdmin, 'STAFF', 'STAFF')
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/already working/)
  })
})

describe('giving and taking office access', () => {
  const actor = { userId: 'admin-1' }
  const target = { userId: 'staff-1', role: 'STAFF' as const, isSystemOwner: false }

  it('can be given to a member of staff, and taken back', () => {
    expect(decideCanSetAdminAccess(actor, target, true, false).allowed).toBe(true)
    expect(decideCanSetAdminAccess(actor, target, false, true).allowed).toBe(true)
  })

  it('is refused for an administrator and for a student, with the reason', () => {
    const forAdmin = decideCanSetAdminAccess(actor, { ...target, role: 'ADMIN' }, true, false)
    expect(forAdmin.allowed).toBe(false)
    if (!forAdmin.allowed) expect(forAdmin.reason).toMatch(/already an administrator/)

    const forStudent = decideCanSetAdminAccess(actor, { ...target, role: 'STUDENT' }, true, false)
    expect(forStudent.allowed).toBe(false)
    if (!forStudent.allowed) expect(forStudent.reason).toMatch(/Only a member of staff/)
  })

  it('is never given to yourself', () => {
    const decision = decideCanSetAdminAccess(actor, { ...target, userId: actor.userId }, true, false)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/your own/)
  })

  it('says so when it would change nothing', () => {
    expect(decideCanSetAdminAccess(actor, target, true, true).allowed).toBe(false)
    expect(decideCanSetAdminAccess(actor, target, false, false).allowed).toBe(false)
  })
})

describe('the small print', () => {
  it('sends each portal to its own front page', () => {
    expect(portalPathFor('ADMIN')).toBe('/admin')
    expect(portalPathFor('STAFF')).toBe('/staff')
    expect(portalPathFor('STUDENT')).toBe('/student')
  })

  it('names each portal in words', () => {
    expect(PORTAL_LABEL.ADMIN).toBe('Office')
    expect(PORTAL_LABEL.STAFF).toBe('Staff')
    expect(PORTAL_LABEL.STUDENT).toBe('Student')
  })
})

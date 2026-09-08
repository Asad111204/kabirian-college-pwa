import { describe, expect, it } from 'vitest'
import {
  confirmationMatches,
  decideCanDelete,
  decideCanDeleteAccount,
  describeBlockers,
  refuseDeletion,
} from '@/server/admin/deletion-policy'

/**
 * Phase 26. A permanent delete has no undo, so the interesting cases are all
 * the refusals: what the college's records still hold, and the rules that
 * stop it locking itself out.
 */
describe('what stands in the way', () => {
  it('allows the delete when every count is nought', () => {
    expect(decideCanDelete('student', [{ what: 'results', count: 0 }, { what: 'documents', count: 0 }]).allowed).toBe(true)
    expect(decideCanDelete('student', []).allowed).toBe(true)
  })

  it('refuses when anything at all refers to the record', () => {
    const decision = decideCanDelete('student', [{ what: 'results', count: 1 }, { what: 'documents', count: 0 }])
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('HAS_HISTORY')
      expect(decision.blockers).toEqual([{ what: 'results', count: 1 }])
    }
  })

  it('names what is in the way and offers deactivation instead', () => {
    const decision = decideCanDelete('student', [
      { what: 'attendance marks', count: 42 },
      { what: 'results', count: 2 },
    ])
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toContain('42 attendance marks and 2 results')
      expect(decision.reason).toMatch(/deactivate them instead/i)
      expect(decision.reason).toContain('student')
    }
  })

  it('reads a list of blockers as a sentence', () => {
    expect(describeBlockers([{ what: 'results', count: 3 }])).toBe('3 results')
    expect(describeBlockers([{ what: 'results', count: 3 }, { what: 'documents', count: 1 }])).toBe('3 results and 1 documents')
    expect(
      describeBlockers([
        { what: 'results', count: 3 },
        { what: 'documents', count: 1 },
        { what: 'fee vouchers', count: 2 },
      ]),
    ).toBe('3 results, 1 documents and 2 fee vouchers')
    expect(describeBlockers([{ what: 'results', count: 0 }])).toBe('')
  })

  it('carries a refusal that has nothing to do with history', () => {
    const decision = refuseDeletion('PROTECTED', 'That account is protected.')
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('PROTECTED')
      expect(decision.blockers).toEqual([])
    }
  })
})

describe('the rules that stop the college locking itself out', () => {
  const actor = { userId: 'admin-1' }
  const target = { userId: 'admin-2', role: 'ADMIN' as const, isSystemOwner: false, username: 'second.admin' }

  it('erases another administrator while one remains', () => {
    expect(decideCanDeleteAccount(actor, target, 2).allowed).toBe(true)
  })

  it('never erases your own account', () => {
    const decision = decideCanDeleteAccount(actor, { ...target, userId: actor.userId }, 5)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('NOT_ALLOWED')
      expect(decision.reason).toMatch(/your own account/)
    }
  })

  it('never erases the protected owner account', () => {
    const decision = decideCanDeleteAccount(actor, { ...target, isSystemOwner: true }, 5)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('PROTECTED')
  })

  it('never erases the last administrator', () => {
    const decision = decideCanDeleteAccount(actor, target, 1)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/only active administrator/)
  })

  it('does not apply the last-administrator rule to a staff or student account', () => {
    expect(decideCanDeleteAccount(actor, { ...target, role: 'STAFF' }, 1).allowed).toBe(true)
    expect(decideCanDeleteAccount(actor, { ...target, role: 'STUDENT' }, 1).allowed).toBe(true)
  })
})

describe('proving you mean it', () => {
  it('matches the record’s own code, ignoring case and spaces', () => {
    expect(confirmationMatches('STU-0001', 'STU-0001')).toBe(true)
    expect(confirmationMatches('STU-0001', ' stu-0001 ')).toBe(true)
  })

  it('refuses anything else, including the empty answer', () => {
    expect(confirmationMatches('STU-0001', 'STU-0002')).toBe(false)
    expect(confirmationMatches('STU-0001', 'delete')).toBe(false)
    expect(confirmationMatches('STU-0001', '')).toBe(false)
    // An empty expectation must never be satisfiable.
    expect(confirmationMatches('', '')).toBe(false)
  })
})

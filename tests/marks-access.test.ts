import { describe, expect, it } from 'vitest'

import {
  decideCanEditMarks,
  decideCanEnterMarks,
  decideCanSubmitMarks,
  findUnenteredStudents,
  isMarkingOpen,
  type MarkingContext,
  type MarksViewer,
} from '../src/server/exams/marks-access'
import { ROLE_DEFAULT_PERMISSIONS } from '../src/server/auth/permissions'

/**
 * Who may enter, change and submit marks.
 *
 * The service resolves the facts — does this teacher hold an active assignment
 * for this subject in this section? has the date sheet been published? — and
 * these functions decide. Every rule gets both the case it allows and the case
 * it refuses.
 */

const teacher = (over: Partial<MarksViewer> = {}): MarksViewer => ({
  role: 'STAFF',
  staffId: 'staff-1',
  canEnter: true,
  canUpdate: true,
  canUpdateSubmitted: false,
  ...over,
})

const admin = (over: Partial<MarksViewer> = {}): MarksViewer => ({
  role: 'ADMIN',
  staffId: null,
  canEnter: true,
  canUpdate: true,
  canUpdateSubmitted: true,
  ...over,
})

const student = (): MarksViewer => ({
  role: 'STUDENT',
  staffId: null,
  canEnter: false,
  canUpdate: false,
  canUpdateSubmitted: false,
})

const assigned = (over: Partial<MarkingContext> = {}): MarkingContext => ({
  hasActiveAssignment: true,
  examStatus: 'MARKS_ENTRY',
  ...over,
})

/* -------------------------------------------------------------------------- */

describe('when marking is open', () => {
  it('opens once the date sheet is published and stays open through marking', () => {
    expect(isMarkingOpen('SCHEDULED')).toBe(true)
    expect(isMarkingOpen('MARKS_ENTRY')).toBe(true)
  })

  it('is closed before the date sheet goes out', () => {
    // DRAFT also covers a withdrawn date sheet, which returns the exam to draft.
    expect(isMarkingOpen('DRAFT')).toBe(false)
  })

  it('is closed for a cancelled or finished exam', () => {
    expect(isMarkingOpen('CANCELLED')).toBe(false)
    expect(isMarkingOpen('COMPLETED')).toBe(false)
  })

  it('explains which of those it is', () => {
    const draft = decideCanEnterMarks(teacher(), assigned({ examStatus: 'DRAFT' }))
    const cancelled = decideCanEnterMarks(teacher(), assigned({ examStatus: 'CANCELLED' }))
    expect(draft.allowed).toBe(false)
    expect(cancelled.allowed).toBe(false)
    if (!draft.allowed) expect(draft.reason).toContain('not been published')
    if (!cancelled.allowed) expect(cancelled.reason).toContain('cancelled')
  })
})

/* -------------------------------------------------------------------------- */

describe('entering marks', () => {
  it('allows an assigned teacher', () => {
    expect(decideCanEnterMarks(teacher(), assigned())).toEqual({ allowed: true })
  })

  it('refuses a teacher with no assignment for this section and subject', () => {
    // The rule that stops the Biology teacher marking Chemistry in a section
    // they already teach.
    const decision = decideCanEnterMarks(teacher(), assigned({ hasActiveAssignment: false }))
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_ASSIGNED')
  })

  it('refuses anybody without the permission, whatever their assignment', () => {
    const decision = decideCanEnterMarks(teacher({ canEnter: false }), assigned())
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NO_PERMISSION')
  })

  it('refuses a student outright', () => {
    const decision = decideCanEnterMarks(student(), assigned())
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NO_PERMISSION')
  })

  it('refuses a staff login that is not linked to a staff record', () => {
    const decision = decideCanEnterMarks(teacher({ staffId: null }), assigned())
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_STAFF')
  })

  it('allows an administrator without any assignment', () => {
    // So the office can key in a paper for a teacher who has left.
    expect(decideCanEnterMarks(admin(), assigned({ hasActiveAssignment: false }))).toEqual({
      allowed: true,
    })
  })

  it('refuses even an administrator when the exam is not open', () => {
    expect(decideCanEnterMarks(admin(), assigned({ examStatus: 'DRAFT' })).allowed).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('changing marks on an existing sheet', () => {
  it('lets an assigned teacher edit a draft', () => {
    expect(decideCanEditMarks(teacher(), assigned(), { status: 'DRAFT' })).toEqual({ allowed: true })
  })

  it('closes a submitted sheet to the teacher', () => {
    const decision = decideCanEditMarks(teacher(), assigned(), { status: 'SUBMITTED' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('SHEET_SUBMITTED')
      expect(decision.reason).toContain('contact the administrator')
    }
  })

  it('opens a submitted sheet only to someone holding marks.update_submitted', () => {
    expect(
      decideCanEditMarks(teacher({ canUpdateSubmitted: true }), assigned(), { status: 'SUBMITTED' }),
    ).toEqual({ allowed: true })
    expect(decideCanEditMarks(admin(), assigned(), { status: 'SUBMITTED' })).toEqual({
      allowed: true,
    })
  })

  it('closes a published sheet to the teacher as well', () => {
    expect(decideCanEditMarks(teacher(), assigned(), { status: 'PUBLISHED' }).allowed).toBe(false)
  })

  it('refuses anybody without marks.update', () => {
    const decision = decideCanEditMarks(teacher({ canUpdate: false }), assigned(), {
      status: 'DRAFT',
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NO_PERMISSION')
  })

  it('still requires the assignment', () => {
    expect(
      decideCanEditMarks(teacher(), assigned({ hasActiveAssignment: false }), { status: 'DRAFT' })
        .allowed,
    ).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('submitting', () => {
  it('lets an assigned teacher submit a draft', () => {
    expect(decideCanSubmitMarks(teacher(), assigned(), { status: 'DRAFT' })).toEqual({
      allowed: true,
    })
  })

  it('refuses a second submission, even from the office', () => {
    for (const viewer of [teacher(), admin()]) {
      const decision = decideCanSubmitMarks(viewer, assigned(), { status: 'SUBMITTED' })
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.code).toBe('SHEET_SUBMITTED')
    }
  })

  it('refuses a teacher with no assignment', () => {
    expect(
      decideCanSubmitMarks(teacher(), assigned({ hasActiveAssignment: false }), { status: 'DRAFT' })
        .allowed,
    ).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('what is still unmarked', () => {
  const marks = [
    { studentId: 'a', status: 'ENTERED' as const },
    { studentId: 'b', status: 'ABSENT' as const },
    { studentId: 'c', status: 'PENDING' as const },
  ]

  it('finds only the students nobody has looked at', () => {
    expect(findUnenteredStudents(marks).map((m) => m.studentId)).toEqual(['c'])
  })

  it('does not treat an absence as unmarked', () => {
    // An absent student HAS been dealt with; they scored zero on purpose.
    expect(findUnenteredStudents([marks[1]!])).toEqual([])
  })

  it('is empty when every student is entered or absent', () => {
    expect(findUnenteredStudents([marks[0]!, marks[1]!])).toEqual([])
  })

  it('is empty for an empty sheet', () => {
    expect(findUnenteredStudents([])).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */

describe('who holds the marks permissions', () => {
  it('gives a teacher entry and ordinary correction, but not correction after submission', () => {
    const staff = ROLE_DEFAULT_PERMISSIONS.STAFF
    expect(staff).toContain('marks.enter')
    expect(staff).toContain('marks.update')
    expect(staff).toContain('marks.view')
    expect(staff).not.toContain('marks.update_submitted')
  })

  it('gives an administrator correction after submission', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain('marks.update_submitted')
  })

  it('gives a student none of them', () => {
    const student = ROLE_DEFAULT_PERMISSIONS.STUDENT
    expect(student).not.toContain('marks.enter')
    expect(student).not.toContain('marks.update')
    expect(student).not.toContain('marks.update_submitted')
  })

  it('adds no new permission for this stage', () => {
    const marks = ROLE_DEFAULT_PERMISSIONS.ADMIN.filter((p) => p.startsWith('marks.')).sort()
    expect(marks).toEqual([
      'marks.enter',
      'marks.update',
      'marks.update_submitted',
      'marks.view',
    ])
  })
})

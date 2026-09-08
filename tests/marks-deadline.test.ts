import { describe, expect, it } from 'vitest'
import {
  decideCanEditMarks,
  decideCanEnterMarks,
  decideCanSubmitMarks,
  isWithinMarksWindow,
  type MarkingContext,
  type MarksViewer,
  type MarksWindow,
} from '@/server/exams/marks-access'

/**
 * Phase 21: the office's marks deadline, reopening one paper, and a teacher
 * correcting their own submitted sheet. Every rule from both sides.
 */
const teacher: MarksViewer = { role: 'STAFF', staffId: 'staff-1', canEnter: true, canUpdate: true, canUpdateSubmitted: true }
const office: MarksViewer = { role: 'ADMIN', staffId: null, canEnter: true, canUpdate: true, canUpdateSubmitted: true }
const assigned: MarkingContext = { hasActiveAssignment: true, examStatus: 'MARKS_ENTRY' }
const window = (over: Partial<MarksWindow> = {}): MarksWindow => ({ today: '2026-09-20', deadline: null, reopenedUntil: null, ...over })

describe('isWithinMarksWindow', () => {
  it('is open when there is no deadline, on the day itself, and before it', () => {
    expect(isWithinMarksWindow(window())).toBe(true)
    expect(isWithinMarksWindow(window({ deadline: '2026-09-20' }))).toBe(true)
    expect(isWithinMarksWindow(window({ deadline: '2026-09-30' }))).toBe(true)
  })

  it('is shut the day after the deadline, unless the paper was reopened to a day not yet past', () => {
    expect(isWithinMarksWindow(window({ deadline: '2026-09-19' }))).toBe(false)
    expect(isWithinMarksWindow(window({ deadline: '2026-09-19', reopenedUntil: '2026-09-25' }))).toBe(true)
    expect(isWithinMarksWindow(window({ deadline: '2026-09-19', reopenedUntil: '2026-09-20' }))).toBe(true)
    expect(isWithinMarksWindow(window({ deadline: '2026-09-19', reopenedUntil: '2026-09-19' }))).toBe(false)
  })
})

describe('entering marks against the deadline', () => {
  it('lets an assigned teacher in before it and refuses them after, naming the date and the office', () => {
    expect(decideCanEnterMarks(teacher, assigned, window({ deadline: '2026-09-30' })).allowed).toBe(true)
    const refused = decideCanEnterMarks(teacher, assigned, window({ deadline: '2026-09-15' }))
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) {
      expect(refused.code).toBe('DEADLINE_PASSED')
      expect(refused.reason).toMatch(/15 Sep/)  // ICU writes "Sept" on some Node builds
      expect(refused.reason).toMatch(/office/)
    }
  })

  it('says so differently when a reopening has run out', () => {
    const refused = decideCanEnterMarks(teacher, assigned, window({ deadline: '2026-09-10', reopenedUntil: '2026-09-15' }))
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.reason).toMatch(/reopened until 15 Sep/)
  })

  it('never binds the office, which passes no window at all', () => {
    expect(decideCanEnterMarks(office, assigned).allowed).toBe(true)
    expect(decideCanEnterMarks(office, assigned, window({ deadline: '2020-01-01' })).allowed).toBe(true)
  })

  it('still requires the assignment: the deadline is a second gate, not a replacement', () => {
    const refused = decideCanEnterMarks(teacher, { ...assigned, hasActiveAssignment: false }, window())
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.code).toBe('NOT_ASSIGNED')
  })
})

describe('a teacher correcting their own submitted sheet', () => {
  it('may, while the window is open', () => {
    expect(decideCanEditMarks(teacher, assigned, { status: 'SUBMITTED' }, window({ deadline: '2026-09-30' })).allowed).toBe(true)
  })

  it('may not once the deadline has passed', () => {
    const refused = decideCanEditMarks(teacher, assigned, { status: 'SUBMITTED' }, window({ deadline: '2026-09-01' }))
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.code).toBe('DEADLINE_PASSED')
  })

  it('may again after the office reopens that paper', () => {
    expect(decideCanEditMarks(teacher, assigned, { status: 'SUBMITTED' }, window({ deadline: '2026-09-01', reopenedUntil: '2026-09-25' })).allowed).toBe(true)
  })

  it('never touches a published sheet, whatever the window says — the office only', () => {
    const refused = decideCanEditMarks(teacher, assigned, { status: 'PUBLISHED' }, window())
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) {
      expect(refused.code).toBe('SHEET_PUBLISHED')
      expect(refused.reason).toMatch(/result has been made/)
    }
    expect(decideCanEditMarks(office, assigned, { status: 'PUBLISHED' }).allowed).toBe(true)
  })

  it('is still refused outright without the permission', () => {
    const refused = decideCanEditMarks({ ...teacher, canUpdateSubmitted: false }, assigned, { status: 'SUBMITTED' }, window())
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.code).toBe('SHEET_SUBMITTED')
  })

  it('leaves drafts exactly as they were', () => {
    expect(decideCanEditMarks(teacher, assigned, { status: 'DRAFT' }, window({ deadline: '2026-09-30' })).allowed).toBe(true)
    expect(decideCanEditMarks(teacher, assigned, { status: 'DRAFT' }, window({ deadline: '2026-09-01' })).allowed).toBe(false)
  })
})

describe('submitting against the deadline', () => {
  it('is refused after it, and allowed before', () => {
    expect(decideCanSubmitMarks(teacher, assigned, { status: 'DRAFT' }, window({ deadline: '2026-09-30' })).allowed).toBe(true)
    expect(decideCanSubmitMarks(teacher, assigned, { status: 'DRAFT' }, window({ deadline: '2026-09-01' })).allowed).toBe(false)
  })
})

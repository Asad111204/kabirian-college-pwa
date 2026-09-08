import { describe, expect, it } from 'vitest'
import {
  decideCanCancelSheet,
  decideCanEditSheet,
  decideCanMarkAttendance,
  teacherCorrectionDeadline,
  type AttendanceViewer,
  type MarkingContext,
} from '@/server/attendance/access'

/**
 * Who may mark, correct and cancel a register.
 *
 * This is the security core of the attendance stage, so every rule is tested
 * from both sides — the case it must allow and the case it must refuse. A rule
 * with only a happy-path test proves nothing about what it keeps out.
 */

const admin: AttendanceViewer = {
  role: 'ADMIN',
  staffId: 'staff-admin',
  canCreate: true,
  canUpdate: true,
  canUpdateSubmitted: true,
}

const teacher: AttendanceViewer = {
  role: 'STAFF',
  staffId: 'staff-1',
  canCreate: true,
  canUpdate: true,
  canUpdateSubmitted: false,
}

const student: AttendanceViewer = {
  role: 'STUDENT',
  staffId: null,
  canCreate: false,
  canUpdate: false,
  canUpdateSubmitted: false,
}

/** Marking Biology, which this teacher is assigned to teach. */
const assignedSubject: MarkingContext = {
  subjectId: 'biology',
  hasActiveAssignment: true,
  isActiveIncharge: false,
}

/** Marking Chemistry, which they are not assigned to. */
const unassignedSubject: MarkingContext = {
  subjectId: 'chemistry',
  hasActiveAssignment: false,
  isActiveIncharge: false,
}

const dailyAsIncharge: MarkingContext = {
  subjectId: null,
  hasActiveAssignment: false,
  isActiveIncharge: true,
}

const dailyNotIncharge: MarkingContext = {
  subjectId: null,
  hasActiveAssignment: false,
  isActiveIncharge: false,
}

describe('subject-wise marking', () => {
  it('lets a teacher mark a subject they are assigned to', () => {
    expect(decideCanMarkAttendance(teacher, assignedSubject).allowed).toBe(true)
  })

  it('refuses a subject they are NOT assigned to', () => {
    // The Biology teacher must not be able to mark Chemistry, even in a section
    // they already teach. Section-level scope alone would allow this.
    expect(decideCanMarkAttendance(teacher, unassignedSubject)).toMatchObject({
      allowed: false,
      code: 'NOT_ASSIGNED',
    })
  })

  it('refuses a teacher who is only the section in-charge', () => {
    // Running the section does not make you the Chemistry teacher.
    expect(
      decideCanMarkAttendance(teacher, {
        subjectId: 'chemistry',
        hasActiveAssignment: false,
        isActiveIncharge: true,
      }),
    ).toMatchObject({ allowed: false, code: 'NOT_ASSIGNED' })
  })

  it('lets an administrator mark any subject', () => {
    expect(decideCanMarkAttendance(admin, unassignedSubject).allowed).toBe(true)
  })
})

describe('daily roll-call', () => {
  it('lets the section in-charge take it', () => {
    expect(decideCanMarkAttendance(teacher, dailyAsIncharge).allowed).toBe(true)
  })

  it('refuses a teacher who is not the in-charge', () => {
    expect(decideCanMarkAttendance(teacher, dailyNotIncharge)).toMatchObject({
      allowed: false,
      code: 'NOT_INCHARGE',
    })
  })

  it('refuses a subject teacher of that section who is not the in-charge', () => {
    // Teaching Biology there does not make you the class teacher.
    expect(
      decideCanMarkAttendance(teacher, {
        subjectId: null,
        hasActiveAssignment: true,
        isActiveIncharge: false,
      }),
    ).toMatchObject({ allowed: false, code: 'NOT_INCHARGE' })
  })

  it('lets an administrator take it', () => {
    expect(decideCanMarkAttendance(admin, dailyNotIncharge).allowed).toBe(true)
  })
})

describe('who cannot mark at all', () => {
  it('refuses a student', () => {
    expect(decideCanMarkAttendance(student, assignedSubject)).toMatchObject({
      allowed: false,
      code: 'NO_PERMISSION',
    })
  })

  it('refuses anyone without the create permission, including an administrator', () => {
    expect(
      decideCanMarkAttendance({ ...admin, canCreate: false }, assignedSubject),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })

  it('refuses a staff login with no staff record linked', () => {
    expect(
      decideCanMarkAttendance({ ...teacher, staffId: null }, assignedSubject),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('editing a draft register', () => {
  const draft = { status: 'DRAFT' as const }

  it('lets the assigned teacher correct their own draft', () => {
    expect(decideCanEditSheet(teacher, assignedSubject, draft).allowed).toBe(true)
  })

  it('refuses a teacher for a subject they are not assigned to', () => {
    expect(decideCanEditSheet(teacher, unassignedSubject, draft)).toMatchObject({
      allowed: false,
      code: 'NOT_ASSIGNED',
    })
  })

  it('refuses anyone without the update permission', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdate: false }, assignedSubject, draft),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('editing a submitted register', () => {
  const submitted = { status: 'SUBMITTED' as const }

  it('refuses the teacher who marked it', () => {
    // Once handed in, changes leave the office's fingerprints, not a teacher's.
    expect(decideCanEditSheet(teacher, assignedSubject, submitted)).toMatchObject({
      allowed: false,
      code: 'SHEET_SUBMITTED',
    })
  })

  it('lets the office correct it', () => {
    expect(decideCanEditSheet(admin, assignedSubject, submitted).allowed).toBe(true)
  })

  it('refuses an administrator whose update_submitted permission was revoked', () => {
    expect(
      decideCanEditSheet({ ...admin, canUpdateSubmitted: false }, assignedSubject, submitted),
    ).toMatchObject({ allowed: false, code: 'SHEET_SUBMITTED' })
  })

  it('lets a teacher granted update_submitted individually correct it', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdateSubmitted: true }, assignedSubject, submitted),
    ).toMatchObject({ allowed: true })
  })

  it('still refuses a subject that teacher does not teach, even with the permission', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdateSubmitted: true }, unassignedSubject, submitted),
    ).toMatchObject({ allowed: false, code: 'NOT_ASSIGNED' })
  })
})

describe('a cancelled register', () => {
  const cancelled = { status: 'CANCELLED' as const }

  it('is closed to teachers', () => {
    expect(decideCanEditSheet(teacher, assignedSubject, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })

  it('is closed to the office too — the class did not happen', () => {
    expect(decideCanEditSheet(admin, assignedSubject, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })

  it('cannot be cancelled twice', () => {
    expect(decideCanCancelSheet(admin, assignedSubject, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })
})

describe('cancelling a register', () => {
  it('lets the assigned teacher cancel their own draft', () => {
    expect(
      decideCanCancelSheet(teacher, assignedSubject, { status: 'DRAFT' }).allowed,
    ).toBe(true)
  })

  it('refuses a teacher cancelling a submitted register', () => {
    // Cancelling removes a class from every student's percentage, so once the
    // register is in, it is the office's decision.
    expect(
      decideCanCancelSheet(teacher, assignedSubject, { status: 'SUBMITTED' }),
    ).toMatchObject({ allowed: false, code: 'SHEET_SUBMITTED' })
  })

  it('lets the office cancel a submitted register', () => {
    expect(
      decideCanCancelSheet(admin, assignedSubject, { status: 'SUBMITTED' }).allowed,
    ).toBe(true)
  })

  it('refuses a student', () => {
    expect(decideCanCancelSheet(student, assignedSubject, { status: 'DRAFT' })).toMatchObject({
      allowed: false,
      code: 'NO_PERMISSION',
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Phase 18: a teacher corrects a submitted register within the window        */
/* -------------------------------------------------------------------------- */

describe('the teacher correction window', () => {
  const correctingTeacher: AttendanceViewer = { ...teacher, canUpdateSubmitted: true }
  const assigned: MarkingContext = { subjectId: 'bio', hasActiveAssignment: true, isActiveIncharge: false }
  const submittedAt = new Date('2026-09-01T05:00:00Z')
  const day = 24 * 60 * 60 * 1000

  it('lets an assigned teacher correct their submitted register inside the window', () => {
    const decision = decideCanEditSheet(correctingTeacher, assigned, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 2 * day), teacherCorrectionDays: 7 })
    expect(decision.allowed).toBe(true)
  })

  it('refuses once the window has passed, naming the number of days and the office', () => {
    const decision = decideCanEditSheet(correctingTeacher, assigned, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 8 * day), teacherCorrectionDays: 7 })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('CORRECTION_WINDOW_CLOSED')
      expect(decision.reason).toMatch(/7 days/)
      expect(decision.reason).toMatch(/office/)
    }
  })

  it('refuses every teacher when the office sets the window to zero', () => {
    const decision = decideCanEditSheet(correctingTeacher, assigned, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 1000), teacherCorrectionDays: 0 })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('CORRECTION_WINDOW_CLOSED')
  })

  it('never applies the window to the office', () => {
    expect(decideCanEditSheet(admin, assigned, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 400 * day), teacherCorrectionDays: 0 }).allowed).toBe(true)
  })

  it('still needs the assignment: the window opens nothing for a teacher of another subject', () => {
    const decision = decideCanEditSheet(correctingTeacher, { ...assigned, hasActiveAssignment: false }, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 1000), teacherCorrectionDays: 7 })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_ASSIGNED')
  })

  it('does not touch drafts or cancelled sheets', () => {
    expect(decideCanEditSheet(correctingTeacher, assigned, { status: 'DRAFT', submittedAt: null }, { now: new Date(), teacherCorrectionDays: 0 }).allowed).toBe(true)
    expect(decideCanEditSheet(correctingTeacher, assigned, { status: 'CANCELLED', submittedAt }, { now: new Date(), teacherCorrectionDays: 7 }).allowed).toBe(false)
  })

  it('computes the deadline from the submission, or none when there is no window', () => {
    expect(teacherCorrectionDeadline(submittedAt, 3)?.toISOString()).toBe('2026-09-04T05:00:00.000Z')
    expect(teacherCorrectionDeadline(submittedAt, 0)).toBeNull()
    expect(teacherCorrectionDeadline(null, 7)).toBeNull()
  })
})

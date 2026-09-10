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

/** The teacher who has this section's first lesson that day. */
const firstPeriodTeacher: MarkingContext = {
  takesFirstPeriod: true,
  noLessonsThatDay: false,
  isActiveIncharge: false,
}

/** A teacher of that section, but not of its first period. */
const laterPeriodTeacher: MarkingContext = {
  takesFirstPeriod: false,
  noLessonsThatDay: false,
  isActiveIncharge: false,
}

/** A day the section has nothing timetabled at all. */
const untimetabledDay: MarkingContext = {
  takesFirstPeriod: false,
  noLessonsThatDay: true,
  isActiveIncharge: false,
}

describe('the register belongs to the first period', () => {
  it('lets the teacher who has the first period take it', () => {
    expect(decideCanMarkAttendance(teacher, firstPeriodTeacher).allowed).toBe(true)
  })

  it('refuses a teacher of the same section who has a later period', () => {
    // Whoever is in front of the room at the start of the day is the one who
    // can see who is missing.
    expect(decideCanMarkAttendance(teacher, laterPeriodTeacher)).toMatchObject({
      allowed: false,
      code: 'NOT_FIRST_PERIOD',
    })
  })

  it('refuses the section in-charge when somebody else has the first period', () => {
    // Running the section no longer carries the register with it: the college
    // moved that job to whoever starts the day.
    expect(
      decideCanMarkAttendance(teacher, {
        takesFirstPeriod: false,
        noLessonsThatDay: false,
        isActiveIncharge: true,
      }),
    ).toMatchObject({ allowed: false, code: 'NOT_FIRST_PERIOD' })
  })

  it('lets the first-period teacher take it even when somebody else is in-charge', () => {
    expect(
      decideCanMarkAttendance(teacher, {
        takesFirstPeriod: true,
        noLessonsThatDay: false,
        isActiveIncharge: false,
      }).allowed,
    ).toBe(true)
  })

  it('lets an administrator take any register', () => {
    expect(decideCanMarkAttendance(admin, laterPeriodTeacher).allowed).toBe(true)
  })
})

describe('a day with nothing timetabled', () => {
  it('falls to the in-charge, so the college is never locked out of its register', () => {
    // A section whose week has not been built yet has no first period. Without
    // this nobody but an administrator could take the register at all.
    expect(
      decideCanMarkAttendance(teacher, { ...untimetabledDay, isActiveIncharge: true }).allowed,
    ).toBe(true)
  })

  it('refuses a teacher who is neither timetabled nor the in-charge', () => {
    expect(decideCanMarkAttendance(teacher, untimetabledDay)).toMatchObject({
      allowed: false,
      code: 'NOT_INCHARGE',
    })
  })

  it('lets an administrator take it', () => {
    expect(decideCanMarkAttendance(admin, untimetabledDay).allowed).toBe(true)
  })
})

describe('who cannot mark at all', () => {
  it('refuses a student', () => {
    expect(decideCanMarkAttendance(student, firstPeriodTeacher)).toMatchObject({
      allowed: false,
      code: 'NO_PERMISSION',
    })
  })

  it('refuses anyone without the create permission, including an administrator', () => {
    expect(
      decideCanMarkAttendance({ ...admin, canCreate: false }, firstPeriodTeacher),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })

  it('refuses a staff login with no staff record linked', () => {
    expect(
      decideCanMarkAttendance({ ...teacher, staffId: null }, firstPeriodTeacher),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('editing a draft register', () => {
  const draft = { status: 'DRAFT' as const }

  it('lets the assigned teacher correct their own draft', () => {
    expect(decideCanEditSheet(teacher, firstPeriodTeacher, draft).allowed).toBe(true)
  })

  it('refuses a teacher who does not have that section’s first period', () => {
    expect(decideCanEditSheet(teacher, laterPeriodTeacher, draft)).toMatchObject({
      allowed: false,
      code: 'NOT_FIRST_PERIOD',
    })
  })

  it('refuses anyone without the update permission', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdate: false }, firstPeriodTeacher, draft),
    ).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('editing a submitted register', () => {
  const submitted = { status: 'SUBMITTED' as const }

  it('refuses the teacher who marked it', () => {
    // Once handed in, changes leave the office's fingerprints, not a teacher's.
    expect(decideCanEditSheet(teacher, firstPeriodTeacher, submitted)).toMatchObject({
      allowed: false,
      code: 'SHEET_SUBMITTED',
    })
  })

  it('lets the office correct it', () => {
    expect(decideCanEditSheet(admin, firstPeriodTeacher, submitted).allowed).toBe(true)
  })

  it('refuses an administrator whose update_submitted permission was revoked', () => {
    expect(
      decideCanEditSheet({ ...admin, canUpdateSubmitted: false }, firstPeriodTeacher, submitted),
    ).toMatchObject({ allowed: false, code: 'SHEET_SUBMITTED' })
  })

  it('lets a teacher granted update_submitted individually correct it', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdateSubmitted: true }, firstPeriodTeacher, submitted),
    ).toMatchObject({ allowed: true })
  })

  it('still refuses a teacher without that first period, even with the permission', () => {
    expect(
      decideCanEditSheet({ ...teacher, canUpdateSubmitted: true }, laterPeriodTeacher, submitted),
    ).toMatchObject({ allowed: false, code: 'NOT_FIRST_PERIOD' })
  })
})

describe('a cancelled register', () => {
  const cancelled = { status: 'CANCELLED' as const }

  it('is closed to teachers', () => {
    expect(decideCanEditSheet(teacher, firstPeriodTeacher, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })

  it('is closed to the office too — the class did not happen', () => {
    expect(decideCanEditSheet(admin, firstPeriodTeacher, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })

  it('cannot be cancelled twice', () => {
    expect(decideCanCancelSheet(admin, firstPeriodTeacher, cancelled)).toMatchObject({
      allowed: false,
      code: 'SHEET_CANCELLED',
    })
  })
})

describe('cancelling a register', () => {
  it('lets the assigned teacher cancel their own draft', () => {
    expect(
      decideCanCancelSheet(teacher, firstPeriodTeacher, { status: 'DRAFT' }).allowed,
    ).toBe(true)
  })

  it('refuses a teacher cancelling a submitted register', () => {
    // Cancelling removes a class from every student's percentage, so once the
    // register is in, it is the office's decision.
    expect(
      decideCanCancelSheet(teacher, firstPeriodTeacher, { status: 'SUBMITTED' }),
    ).toMatchObject({ allowed: false, code: 'SHEET_SUBMITTED' })
  })

  it('lets the office cancel a submitted register', () => {
    expect(
      decideCanCancelSheet(admin, firstPeriodTeacher, { status: 'SUBMITTED' }).allowed,
    ).toBe(true)
  })

  it('refuses a student', () => {
    expect(decideCanCancelSheet(student, firstPeriodTeacher, { status: 'DRAFT' })).toMatchObject({
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
  const assigned: MarkingContext = { takesFirstPeriod: true, noLessonsThatDay: false, isActiveIncharge: false }
  const submittedAt = new Date('2026-09-01T05:00:00Z')
  const day = 24 * 60 * 60 * 1000

  it('lets the first-period teacher correct their submitted register inside the window', () => {
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

  it('still needs the first period: the window opens nothing for a teacher of a later one', () => {
    const decision = decideCanEditSheet(correctingTeacher, { ...assigned, takesFirstPeriod: false }, { status: 'SUBMITTED', submittedAt }, { now: new Date(submittedAt.getTime() + 1000), teacherCorrectionDays: 7 })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_FIRST_PERIOD')
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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PERIODS,
  TEACHING_PERIODS,
  findPeriod,
  isBreakPeriod,
  isValidPeriodNumber,
} from '@/server/timetable/periods'
import {
  type ProposedSlot,
  type TeacherAssignmentFacts,
  type TimetableSlotFacts,
  decidePeriodAllowed,
  decideSubjectAllowed,
  decideTeacherAllowed,
  findRoomClash,
  findSectionClash,
  findTeacherClash,
  findTimetableClashes,
} from '@/server/timetable/timetable-policy'

/**
 * The timetable rules and the college's period grid.
 *
 * Pure functions and a constant, so there is no database here. Each clash rule
 * is checked both ways — the arrangement it refuses and the neighbouring one it
 * must allow — because a rule that only ever says no is as broken as one that
 * only ever says yes.
 */

const SESSION = 'session-2026-27'
const OTHER_SESSION = 'session-2027-28'
const SECTION_A = 'section-a'
const SECTION_B = 'section-b'
const TEACHER_1 = 'staff-1'
const TEACHER_2 = 'staff-2'
const BIOLOGY = 'subject-biology'
const CHEMISTRY = 'subject-chemistry'

/** A saved lesson: section A, Monday period 3, teacher 1, in Lab 1. */
const saved = (over: Partial<TimetableSlotFacts> = {}): TimetableSlotFacts => ({
  id: 'slot-existing',
  academicSessionId: SESSION,
  sectionId: SECTION_A,
  staffId: TEACHER_1,
  room: 'Lab 1',
  dayOfWeek: 'MONDAY',
  period: 3,
  isActive: true,
  ...over,
})

/** A lesson being saved into the same cell, by default identical. */
const proposed = (over: Partial<ProposedSlot> = {}): ProposedSlot => ({
  academicSessionId: SESSION,
  sectionId: SECTION_A,
  staffId: TEACHER_1,
  room: 'Lab 1',
  dayOfWeek: 'MONDAY',
  period: 3,
  ...over,
})

/* -------------------------------------------------------------------------- */
/* A. Section clash                                                           */
/* -------------------------------------------------------------------------- */

describe('a section cannot be in two places at once', () => {
  it('refuses a second lesson for the same section in the same period', () => {
    const clash = findSectionClash(proposed({ staffId: TEACHER_2, room: null }), [saved()])
    expect(clash?.kind).toBe('SECTION')
    expect(clash?.slotId).toBe('slot-existing')
    expect(clash?.reason).toMatch(/already has a lesson/i)
  })

  it('allows another section the same period', () => {
    expect(
      findSectionClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: null }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('allows the same section a different period', () => {
    expect(findSectionClash(proposed({ period: 4 }), [saved()])).toBeNull()
  })

  it('allows the same section the same period on another day', () => {
    expect(findSectionClash(proposed({ dayOfWeek: 'TUESDAY' }), [saved()])).toBeNull()
  })

  it('ignores a lesson that has been deactivated', () => {
    expect(findSectionClash(proposed(), [saved({ isActive: false })])).toBeNull()
  })

  it('does not find a lesson clashing with itself while it is edited', () => {
    expect(findSectionClash(proposed({ id: 'slot-existing' }), [saved()])).toBeNull()
  })

  it('does not reach across academic sessions', () => {
    expect(findSectionClash(proposed(), [saved({ academicSessionId: OTHER_SESSION })])).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* B. Teacher clash                                                           */
/* -------------------------------------------------------------------------- */

describe('a teacher cannot be in two places at once', () => {
  it('refuses the same teacher in two sections in the same period', () => {
    const clash = findTeacherClash(proposed({ sectionId: SECTION_B, room: null }), [saved()])
    expect(clash?.kind).toBe('TEACHER')
    expect(clash?.slotId).toBe('slot-existing')
    expect(clash?.reason).toMatch(/already taking another lesson/i)
  })

  it('allows a different teacher in the same period', () => {
    expect(
      findTeacherClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: null }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('allows the same teacher a different period', () => {
    expect(findTeacherClash(proposed({ sectionId: SECTION_B, period: 5 }), [saved()])).toBeNull()
  })

  it('allows the same teacher the same period on another day', () => {
    expect(
      findTeacherClash(proposed({ sectionId: SECTION_B, dayOfWeek: 'WEDNESDAY' }), [saved()]),
    ).toBeNull()
  })

  it('ignores a deactivated lesson', () => {
    expect(
      findTeacherClash(proposed({ sectionId: SECTION_B }), [saved({ isActive: false })]),
    ).toBeNull()
  })

  it('does not reach across academic sessions', () => {
    expect(
      findTeacherClash(proposed({ sectionId: SECTION_B }), [
        saved({ academicSessionId: OTHER_SESSION }),
      ]),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* C. Room clash                                                              */
/* -------------------------------------------------------------------------- */

describe('a room cannot hold two lessons at once', () => {
  it('refuses the same room in the same period', () => {
    const clash = findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2 }), [saved()])
    expect(clash?.kind).toBe('ROOM')
    expect(clash?.reason).toMatch(/already in use/i)
  })

  it('allows a different room', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: 'Room 12' }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('treats the same room written differently as the same room', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: '  lab 1 ' }), [
        saved(),
      ]),
    ).not.toBeNull()
  })

  it('lets a lesson with no room be saved beside one that has a room', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: null }), [saved()]),
    ).toBeNull()
  })

  it('does not clash two lessons that both have no room', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: null }), [
        saved({ room: null }),
      ]),
    ).toBeNull()
  })

  it('treats an empty or blank room as no room at all', () => {
    for (const room of ['', '   ']) {
      expect(
        findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room }), [
          saved({ room }),
        ]),
      ).toBeNull()
    }
  })

  it('allows the same room a different period', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, period: 7 }), [saved()]),
    ).toBeNull()
  })

  it('allows the same room the same period on another day', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2, dayOfWeek: 'SATURDAY' }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('ignores a deactivated lesson', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2 }), [
        saved({ isActive: false }),
      ]),
    ).toBeNull()
  })

  it('does not reach across academic sessions', () => {
    expect(
      findRoomClash(proposed({ sectionId: SECTION_B, staffId: TEACHER_2 }), [
        saved({ academicSessionId: OTHER_SESSION }),
      ]),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* All three at once                                                          */
/* -------------------------------------------------------------------------- */

describe('every clash is reported, not just the first', () => {
  it('reports section, teacher and room together', () => {
    const clashes = findTimetableClashes(proposed(), [saved()])
    expect(clashes.map((c) => c.kind).sort()).toEqual(['ROOM', 'SECTION', 'TEACHER'])
  })

  it('reports nothing for a free cell', () => {
    expect(
      findTimetableClashes(
        proposed({ sectionId: SECTION_B, staffId: TEACHER_2, room: 'Room 12', period: 8 }),
        [saved()],
      ),
    ).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Period eligibility                                                         */
/* -------------------------------------------------------------------------- */

describe('nothing may be timetabled in the break', () => {
  it('allows every teaching period', () => {
    for (const period of [1, 2, 3, 4, 5, 7, 8, 9]) {
      expect(decidePeriodAllowed(period)).toEqual({ allowed: true })
    }
  })

  it('refuses period 6, the college break', () => {
    const decision = decidePeriodAllowed(6)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('BREAK_PERIOD')
      // The reason names the period and its clock times, so the office can see
      // it is the break rather than a bug.
      expect(decision.reason).toMatch(/11:10/)
      expect(decision.reason).toMatch(/11:40/)
    }
  })

  it('refuses a number that is not a period of the day', () => {
    for (const period of [0, -1, 10, 99]) {
      const decision = decidePeriodAllowed(period)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.code).toBe('NOT_A_PERIOD')
    }
  })

  it('keeps the break out of the teaching periods it allows', () => {
    const allowed = PERIODS.filter((p) => decidePeriodAllowed(p.period).allowed).map(
      (p) => p.period,
    )
    expect(allowed).toEqual(TEACHING_PERIODS.map((p) => p.period))
  })
})

/* -------------------------------------------------------------------------- */
/* D. Subject eligibility                                                     */
/* -------------------------------------------------------------------------- */

describe('a section may only be timetabled its own subjects', () => {
  it('allows a subject on the curriculum', () => {
    expect(decideSubjectAllowed({ subjectIds: [BIOLOGY, CHEMISTRY] }, BIOLOGY)).toEqual({
      allowed: true,
    })
  })

  it('refuses a subject the section does not study', () => {
    const decision = decideSubjectAllowed({ subjectIds: [BIOLOGY] }, CHEMISTRY)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('SUBJECT_NOT_IN_CURRICULUM')
  })

  it('refuses when the section has no curriculum at all', () => {
    const decision = decideSubjectAllowed(null, BIOLOGY)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('UNKNOWN_CURRICULUM')
  })

  it('refuses against an empty curriculum rather than passing it', () => {
    expect(decideSubjectAllowed({ subjectIds: [] }, BIOLOGY).allowed).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* E. Teacher assignment eligibility                                          */
/* -------------------------------------------------------------------------- */

describe('only the assigned teacher may be timetabled', () => {
  const assignment = (over: Partial<TeacherAssignmentFacts> = {}): TeacherAssignmentFacts => ({
    staffId: TEACHER_1,
    sectionId: SECTION_A,
    subjectId: BIOLOGY,
    isActive: true,
    ...over,
  })

  const lesson = { staffId: TEACHER_1, sectionId: SECTION_A, subjectId: BIOLOGY }

  it('allows a teacher holding an active assignment', () => {
    expect(decideTeacherAllowed([assignment()], lesson)).toEqual({ allowed: true })
  })

  it('refuses a teacher with no assignment at all', () => {
    const decision = decideTeacherAllowed([], lesson)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('TEACHER_NOT_ASSIGNED')
  })

  it('refuses a closed assignment', () => {
    expect(decideTeacherAllowed([assignment({ isActive: false })], lesson).allowed).toBe(false)
  })

  it('refuses another subject in a section the teacher does teach', () => {
    expect(
      decideTeacherAllowed([assignment()], { ...lesson, subjectId: CHEMISTRY }).allowed,
    ).toBe(false)
  })

  it('refuses the same subject in a section the teacher does not teach', () => {
    expect(decideTeacherAllowed([assignment()], { ...lesson, sectionId: SECTION_B }).allowed).toBe(
      false,
    )
  })

  it('refuses a different teacher holding the assignment', () => {
    expect(decideTeacherAllowed([assignment()], { ...lesson, staffId: TEACHER_2 }).allowed).toBe(
      false,
    )
  })
})

/* -------------------------------------------------------------------------- */
/* The college's period grid                                                  */
/* -------------------------------------------------------------------------- */

describe('the college period grid', () => {
  it('is the nine periods the college runs', () => {
    expect(PERIODS.map((p) => [p.period, p.start, p.end])).toEqual([
      [1, '08:00', '08:30'],
      [2, '08:30', '09:00'],
      [3, '09:10', '10:00'],
      [4, '10:10', '10:40'],
      [5, '10:40', '11:10'],
      [6, '11:10', '11:40'],
      [7, '11:40', '12:10'],
      [8, '12:10', '12:40'],
      [9, '12:40', '13:20'],
    ])
  })

  it('marks period 6 as the break, and nothing else', () => {
    expect(PERIODS.filter((p) => p.isBreak).map((p) => p.period)).toEqual([6])
    expect(isBreakPeriod(6)).toBe(true)
    expect(isBreakPeriod(5)).toBe(false)
    expect(isBreakPeriod(7)).toBe(false)
  })

  it('offers the teaching periods without the break', () => {
    expect(TEACHING_PERIODS.map((p) => p.period)).toEqual([1, 2, 3, 4, 5, 7, 8, 9])
  })

  it('finds a period by number, and refuses one outside the day', () => {
    expect(findPeriod(3)?.start).toBe('09:10')
    expect(findPeriod(0)).toBeNull()
    expect(findPeriod(10)).toBeNull()
    expect(isValidPeriodNumber(9)).toBe(true)
    expect(isValidPeriodNumber(10)).toBe(false)
    // A number that is not a period is not the break either.
    expect(isBreakPeriod(99)).toBe(false)
  })

  it('states every time as a 24-hour HH:MM clock face, in order', () => {
    for (const p of PERIODS) {
      expect(p.start).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      expect(p.end).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      expect(p.start < p.end).toBe(true)
    }
    // Periods run forwards through the day and never overlap.
    for (let i = 1; i < PERIODS.length; i += 1) {
      expect(PERIODS[i]!.start >= PERIODS[i - 1]!.end).toBe(true)
    }
  })

  it('numbers the periods 1..9 with no gaps, so a slot can only mean one of them', () => {
    expect(PERIODS.map((p) => p.period)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

/* -------------------------------------------------------------------------- */
/* The numbering the register already uses                                    */
/* -------------------------------------------------------------------------- */

describe('period numbering stays aligned with the attendance register', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')
  const modelBody = (name: string) =>
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ''

  it('stores the period as the same column type on both tables', () => {
    for (const model of ['AttendanceSheet', 'TimetableSlot']) {
      expect(modelBody(model)).toMatch(/period\s+Int\s+.*@db\.SmallInt/)
    }
  })

  it('keeps every configured period inside what that column can hold', () => {
    for (const p of PERIODS) {
      expect(Number.isInteger(p.period)).toBe(true)
      expect(p.period).toBeGreaterThan(0)
      expect(p.period).toBeLessThanOrEqual(32767)
    }
  })

  it('starts at 1, which is what an unqualified register defaults to', () => {
    expect(modelBody('AttendanceSheet')).toMatch(/period\s+Int\s+@default\(1\)/)
    expect(PERIODS[0]!.period).toBe(1)
  })

  it('does not put clock times on the timetable row', () => {
    const body = modelBody('TimetableSlot')
    expect(body).not.toMatch(/startTime|endTime|start_time|end_time/)
  })
})

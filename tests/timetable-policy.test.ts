import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERIODS,
  MAX_PERIOD_NUMBER,
  findPeriodIn,
  inClockOrder,
  isValidPeriodIn,
  lengthOf,
  minutesOf,
  problemsWithGrid,
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
  sectionIds: [SECTION_A],
  subjectId: BIOLOGY,
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
  sectionIds: [SECTION_A],
  subjectId: BIOLOGY,
  staffId: TEACHER_1,
  room: 'Lab 1',
  dayOfWeek: 'MONDAY',
  period: 3,
  ...over,
})

/* -------------------------------------------------------------------------- */
/* A. Section clash                                                           */
/* -------------------------------------------------------------------------- */

describe('a section may split, but never take the same subject twice at once', () => {
  it('refuses the same subject for the same section in the same period', () => {
    const clash = findSectionClash(proposed({ staffId: TEACHER_2, room: null }), [saved()])
    expect(clash?.kind).toBe('SECTION')
    expect(clash?.slotId).toBe('slot-existing')
    expect(clash?.reason).toMatch(/already has this subject/i)
  })

  it('allows a second lesson in the same period when the subject differs', () => {
    // The elective split the college's own timetable is full of: some of the
    // room does Chemistry while the rest does Computer, same hour.
    expect(
      findSectionClash(proposed({ subjectId: CHEMISTRY, staffId: TEACHER_2, room: null }), [saved()]),
    ).toBeNull()
  })

  it('refuses when only one of several sections already has the subject', () => {
    const clash = findSectionClash(
      proposed({ sectionIds: [SECTION_B, SECTION_A], staffId: TEACHER_2, room: null }),
      [saved()],
    )
    expect(clash?.kind).toBe('SECTION')
  })

  it('allows a class taught to several sections none of which has it yet', () => {
    expect(
      findSectionClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: null }), [saved()]),
    ).toBeNull()
  })

  it('allows another section the same period', () => {
    expect(
      findSectionClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: null }), [
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
    const clash = findTeacherClash(proposed({ sectionIds: [SECTION_B], room: null }), [saved()])
    expect(clash?.kind).toBe('TEACHER')
    expect(clash?.slotId).toBe('slot-existing')
    expect(clash?.reason).toMatch(/already taking another lesson/i)
  })

  it('allows a different teacher in the same period', () => {
    expect(
      findTeacherClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: null }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('allows the same teacher a different period', () => {
    expect(findTeacherClash(proposed({ sectionIds: [SECTION_B], period: 5 }), [saved()])).toBeNull()
  })

  it('allows the same teacher the same period on another day', () => {
    expect(
      findTeacherClash(proposed({ sectionIds: [SECTION_B], dayOfWeek: 'WEDNESDAY' }), [saved()]),
    ).toBeNull()
  })

  it('ignores a deactivated lesson', () => {
    expect(
      findTeacherClash(proposed({ sectionIds: [SECTION_B] }), [saved({ isActive: false })]),
    ).toBeNull()
  })

  it('does not reach across academic sessions', () => {
    expect(
      findTeacherClash(proposed({ sectionIds: [SECTION_B] }), [
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
    const clash = findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2 }), [saved()])
    expect(clash?.kind).toBe('ROOM')
    expect(clash?.reason).toMatch(/already in use/i)
  })

  it('allows a different room', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: 'Room 12' }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('treats the same room written differently as the same room', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: '  lab 1 ' }), [
        saved(),
      ]),
    ).not.toBeNull()
  })

  it('lets a lesson with no room be saved beside one that has a room', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: null }), [saved()]),
    ).toBeNull()
  })

  it('does not clash two lessons that both have no room', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: null }), [
        saved({ room: null }),
      ]),
    ).toBeNull()
  })

  it('treats an empty or blank room as no room at all', () => {
    for (const room of ['', '   ']) {
      expect(
        findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room }), [
          saved({ room }),
        ]),
      ).toBeNull()
    }
  })

  it('allows the same room a different period', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, period: 7 }), [saved()]),
    ).toBeNull()
  })

  it('allows the same room the same period on another day', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, dayOfWeek: 'SATURDAY' }), [
        saved(),
      ]),
    ).toBeNull()
  })

  it('ignores a deactivated lesson', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2 }), [
        saved({ isActive: false }),
      ]),
    ).toBeNull()
  })

  it('does not reach across academic sessions', () => {
    expect(
      findRoomClash(proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2 }), [
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
        proposed({ sectionIds: [SECTION_B], staffId: TEACHER_2, room: 'Room 12', period: 8 }),
        [saved()],
      ),
    ).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Period eligibility                                                         */
/* -------------------------------------------------------------------------- */

describe('every period of the day may be timetabled', () => {
  it('allows every period the college has', () => {
    for (const period of DEFAULT_PERIODS) {
      expect(decidePeriodAllowed(period.period, DEFAULT_PERIODS)).toEqual({ allowed: true })
    }
  })

  it('allows what used to be the break, because there is no break any more', () => {
    // Period 6 was the college break and nothing could be put in it. The
    // college asked for that to go: a break is an hour they choose not to
    // fill, which needs no rule.
    expect(decidePeriodAllowed(6, DEFAULT_PERIODS)).toEqual({ allowed: true })
  })

  it('refuses a number the college’s own grid does not have', () => {
    for (const period of [0, -1, 10, 99]) {
      const decision = decidePeriodAllowed(period, DEFAULT_PERIODS)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.code).toBe('NOT_A_PERIOD')
    }
  })

  it('follows the grid it is given rather than a fixed one', () => {
    // A college that runs three periods has three, and a request for a fourth
    // is refused however ordinary that number looks.
    const short = [
      { period: 1, start: '08:00', end: '09:00' },
      { period: 2, start: '09:00', end: '10:00' },
      { period: 3, start: '10:00', end: '11:00' },
    ]
    expect(decidePeriodAllowed(3, short)).toEqual({ allowed: true })
    expect(decidePeriodAllowed(4, short).allowed).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* C2. The college's own day                                                  */
/* -------------------------------------------------------------------------- */

describe('the grid the college keeps', () => {
  const grid = (rows: { period: number; start: string; end: string }[]) => rows

  it('accepts the day the college started with', () => {
    expect(problemsWithGrid(DEFAULT_PERIODS)).toEqual([])
  })

  it('refuses a day with no periods at all', () => {
    expect(problemsWithGrid([])).toHaveLength(1)
  })

  it('refuses a period that ends before it starts', () => {
    const problems = problemsWithGrid(grid([{ period: 1, start: '10:00', end: '09:00' }]))
    expect(problems.some((p) => /ends before it starts/.test(p))).toBe(true)
  })

  it('refuses a time that is not a time', () => {
    expect(problemsWithGrid(grid([{ period: 1, start: '25:00', end: '26:00' }])).length).toBeGreaterThan(0)
    expect(problemsWithGrid(grid([{ period: 1, start: '8am', end: '9am' }])).length).toBeGreaterThan(0)
  })

  it('refuses the same period number twice', () => {
    const problems = problemsWithGrid(
      grid([
        { period: 1, start: '08:00', end: '09:00' },
        { period: 1, start: '09:00', end: '10:00' },
      ]),
    )
    expect(problems.some((p) => /listed twice/.test(p))).toBe(true)
  })

  it('refuses two periods that overlap', () => {
    // This is the one that matters. Every clash rule compares period NUMBERS,
    // so two periods sharing an hour would put a teacher in two lessons at
    // once while every check reported the timetable as sound.
    const problems = problemsWithGrid(
      grid([
        { period: 1, start: '08:00', end: '09:00' },
        { period: 2, start: '08:30', end: '09:30' },
      ]),
    )
    expect(problems.some((p) => /overlap/.test(p))).toBe(true)
  })

  it('allows periods that merely touch, and gaps between them', () => {
    expect(
      problemsWithGrid(
        grid([
          { period: 1, start: '08:00', end: '09:00' },
          { period: 2, start: '09:00', end: '10:00' },
          { period: 3, start: '10:30', end: '11:00' },
        ]),
      ),
    ).toEqual([])
  })

  it('finds an overlap whatever order the periods were sent in', () => {
    const problems = problemsWithGrid(
      grid([
        { period: 2, start: '08:30', end: '09:30' },
        { period: 1, start: '08:00', end: '09:00' },
      ]),
    )
    expect(problems.some((p) => /overlap/.test(p))).toBe(true)
  })

  it('refuses a period number outside what a college day could have', () => {
    expect(problemsWithGrid(grid([{ period: 0, start: '08:00', end: '09:00' }])).length).toBeGreaterThan(0)
    expect(
      problemsWithGrid(grid([{ period: MAX_PERIOD_NUMBER + 1, start: '08:00', end: '09:00' }])).length,
    ).toBeGreaterThan(0)
  })

  it('puts a grid into the order the day actually runs', () => {
    const ordered = inClockOrder(
      grid([
        { period: 9, start: '12:40', end: '13:20' },
        { period: 1, start: '08:00', end: '08:30' },
      ]),
    )
    expect(ordered.map((p) => p.period)).toEqual([1, 9])
  })

  it('reads a period back by number, and says when there is none', () => {
    expect(findPeriodIn(DEFAULT_PERIODS, 3)?.start).toBe('09:10')
    expect(findPeriodIn(DEFAULT_PERIODS, 99)).toBeNull()
    expect(isValidPeriodIn(DEFAULT_PERIODS, 3)).toBe(true)
    expect(isValidPeriodIn(DEFAULT_PERIODS, 99)).toBe(false)
  })

  it('measures a period in minutes', () => {
    expect(minutesOf('09:10')).toBe(550)
    expect(lengthOf({ period: 3, start: '09:10', end: '10:00' })).toBe(50)
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

describe('the day the college starts with', () => {
  it('is the nine periods it was running when the system was built', () => {
    expect(DEFAULT_PERIODS.map((p) => [p.period, p.start, p.end])).toEqual([
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

  it('marks none of them as a break, because there is no such thing now', () => {
    for (const period of DEFAULT_PERIODS) {
      expect('isBreak' in period).toBe(false)
    }
  })

  it('states every time as a 24-hour HH:MM clock face, in order', () => {
    for (const p of DEFAULT_PERIODS) {
      expect(p.start).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      expect(p.end).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      expect(minutesOf(p.start) < minutesOf(p.end)).toBe(true)
    }
  })

  it('numbers them 1..9 with no gaps, so a lesson can only mean one of them', () => {
    expect(DEFAULT_PERIODS.map((p) => p.period)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('survives its own rules, which is what the office starts from', () => {
    expect(problemsWithGrid(DEFAULT_PERIODS)).toEqual([])
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

  it('keeps every period number the college may set inside what that column can hold', () => {
    // The office can edit the day now, so this checks the ceiling the code
    // allows rather than only the nine periods it happens to start with.
    expect(MAX_PERIOD_NUMBER).toBeLessThanOrEqual(32767)
    for (const p of DEFAULT_PERIODS) {
      expect(Number.isInteger(p.period)).toBe(true)
      expect(p.period).toBeGreaterThan(0)
      expect(p.period).toBeLessThanOrEqual(32767)
    }
  })

  it('starts at 1, which is what an unqualified register defaults to', () => {
    expect(modelBody('AttendanceSheet')).toMatch(/period\s+Int\s+@default\(1\)/)
    expect(DEFAULT_PERIODS[0]!.period).toBe(1)
  })

  it('does not put clock times on the timetable row', () => {
    const body = modelBody('TimetableSlot')
    expect(body).not.toMatch(/startTime|endTime|start_time|end_time/)
  })
})

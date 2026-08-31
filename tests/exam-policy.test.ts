import { describe, expect, it } from 'vitest'

import {
  buildDateSheet,
  checkPaperScope,
  findDateSheetProblems,
  findPaperConflict,
  isDateWithinExam,
  scopesOverlap,
  timesOverlap,
  type ClassCurriculum,
  type ScheduledPaper,
} from '../src/server/exams/exam-policy'
import { isDateSheetPublished, isExamEditable } from '../src/validation/exams'

/**
 * The exam scheduling rules.
 *
 * These run with no database: the service does the lookups and hands the
 * answers to these functions, so the rules themselves can be checked
 * exhaustively here.
 */

const PRE_MED = 'program-premed'
const PRE_ENG = 'program-preeng'

/** 1st Year runs two programmes. Both study English; only one studies Biology. */
const FIRST_YEAR: ClassCurriculum = {
  programIds: [PRE_MED, PRE_ENG],
  subjectsByProgram: {
    [PRE_MED]: ['english', 'biology', 'chemistry'],
    [PRE_ENG]: ['english', 'maths', 'chemistry'],
  },
}

function paper(over: Partial<ScheduledPaper> = {}): ScheduledPaper {
  return {
    id: 'paper-1',
    classId: 'class-1',
    className: '1st Year',
    programId: PRE_MED,
    programName: 'Pre-Medical',
    subjectId: 'biology',
    subjectName: 'Biology',
    examDate: '2026-05-10',
    startTime: '09:00',
    endTime: '12:00',
    room: null,
    maxMarks: '100.00',
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('which subjects may become a paper', () => {
  it('accepts a subject on the chosen programme’s curriculum', () => {
    expect(checkPaperScope(FIRST_YEAR, { programId: PRE_MED, subjectId: 'biology' })).toEqual({
      ok: true,
    })
  })

  it('refuses a subject the programme does not study', () => {
    const verdict = checkPaperScope(FIRST_YEAR, { programId: PRE_ENG, subjectId: 'biology' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('subjectId')
  })

  it('accepts a whole-class paper only when every programme studies it', () => {
    // English is on both curricula, so one paper can cover the class.
    expect(checkPaperScope(FIRST_YEAR, { programId: null, subjectId: 'english' })).toEqual({
      ok: true,
    })
    // Biology is not, so a whole-class Biology paper would be sat by students
    // who do not take Biology.
    const verdict = checkPaperScope(FIRST_YEAR, { programId: null, subjectId: 'biology' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.field).toBe('subjectId')
      expect(verdict.message).toContain('every programme')
    }
  })

  it('treats a missing programme the same as an explicit null', () => {
    expect(checkPaperScope(FIRST_YEAR, { subjectId: 'english' })).toEqual({ ok: true })
    expect(checkPaperScope(FIRST_YEAR, { subjectId: 'biology' }).ok).toBe(false)
  })

  it('refuses a programme that does not run in this class', () => {
    const verdict = checkPaperScope(FIRST_YEAR, { programId: 'program-fait', subjectId: 'english' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('programId')
  })

  it('refuses a class that is not in the session at all', () => {
    const verdict = checkPaperScope(null, { programId: PRE_MED, subjectId: 'biology' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('classId')
  })

  it('refuses a class whose programmes have no curriculum yet', () => {
    const empty: ClassCurriculum = { programIds: [PRE_MED], subjectsByProgram: {} }
    expect(checkPaperScope(empty, { programId: PRE_MED, subjectId: 'biology' }).ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('which papers could be sat by the same student', () => {
  it('overlaps a whole-class paper with anything in that class', () => {
    expect(scopesOverlap(null, PRE_MED)).toBe(true)
    expect(scopesOverlap(PRE_MED, null)).toBe(true)
    expect(scopesOverlap(null, null)).toBe(true)
  })

  it('does not overlap two different programmes', () => {
    expect(scopesOverlap(PRE_MED, PRE_ENG)).toBe(false)
    expect(scopesOverlap(PRE_MED, PRE_MED)).toBe(true)
  })
})

describe('clashing times', () => {
  const range = (start: string | null, end: string | null) => ({ start, end })

  it('overlaps when the ranges cross', () => {
    expect(timesOverlap(range('09:00', '12:00'), range('11:00', '13:00'))).toBe(true)
    expect(timesOverlap(range('11:00', '13:00'), range('09:00', '12:00'))).toBe(true)
  })

  it('allows a paper that starts exactly when another ends', () => {
    expect(timesOverlap(range('09:00', '12:00'), range('12:00', '15:00'))).toBe(false)
  })

  it('clashes when two papers start at the same moment', () => {
    expect(timesOverlap(range('09:00', null), range('09:00', null))).toBe(true)
    expect(timesOverlap(range('09:00', '12:00'), range('09:00', '10:00'))).toBe(true)
  })

  it('treats an unscheduled paper as clashing with nothing', () => {
    expect(timesOverlap(range(null, null), range('09:00', '12:00'))).toBe(false)
    expect(timesOverlap(range('09:00', '12:00'), range(null, null))).toBe(false)
  })
})

describe('refusing an impossible paper', () => {
  it('accepts a paper that clashes with nothing', () => {
    expect(findPaperConflict([paper()], { classId: 'class-1', subjectId: 'chemistry', programId: PRE_MED, examDate: '2026-05-12', startTime: '09:00' })).toBeNull()
  })

  it('refuses a second paper for the same subject and programme', () => {
    const conflict = findPaperConflict([paper()], {
      classId: 'class-1',
      subjectId: 'biology',
      programId: PRE_MED,
    })
    expect(conflict?.kind).toBe('duplicate-subject')
  })

  it('refuses a whole-class paper when one programme already has that subject', () => {
    // Otherwise a Pre-Medical student would end up with two Biology marks.
    const conflict = findPaperConflict([paper()], {
      classId: 'class-1',
      subjectId: 'biology',
      programId: null,
    })
    expect(conflict?.kind).toBe('duplicate-subject')
    expect(conflict?.message).toContain('two marks')
  })

  it('refuses a programme paper when the whole class already sits that subject', () => {
    const shared = paper({ programId: null, programName: null, subjectId: 'english', subjectName: 'English' })
    const conflict = findPaperConflict([shared], {
      classId: 'class-1',
      subjectId: 'english',
      programId: PRE_MED,
    })
    expect(conflict?.kind).toBe('duplicate-subject')
  })

  it('allows the same subject for two different programmes', () => {
    expect(
      findPaperConflict([paper({ subjectId: 'chemistry', subjectName: 'Chemistry' })], {
        classId: 'class-1',
        subjectId: 'chemistry',
        programId: PRE_ENG,
      }),
    ).toBeNull()
  })

  it('refuses two papers at overlapping times for the same students', () => {
    const conflict = findPaperConflict([paper()], {
      classId: 'class-1',
      subjectId: 'chemistry',
      programId: PRE_MED,
      examDate: '2026-05-10',
      startTime: '11:00',
      endTime: '14:00',
    })
    expect(conflict?.kind).toBe('time-clash')
    expect(conflict?.field).toBe('startTime')
  })

  it('allows the same time on a different day', () => {
    expect(
      findPaperConflict([paper()], {
        classId: 'class-1',
        subjectId: 'chemistry',
        programId: PRE_MED,
        examDate: '2026-05-11',
        startTime: '09:00',
        endTime: '12:00',
      }),
    ).toBeNull()
  })

  it('allows the same time for a different programme', () => {
    expect(
      findPaperConflict([paper()], {
        classId: 'class-1',
        subjectId: 'maths',
        programId: PRE_ENG,
        examDate: '2026-05-10',
        startTime: '09:00',
        endTime: '12:00',
      }),
    ).toBeNull()
  })

  it('ignores papers in another class entirely', () => {
    expect(
      findPaperConflict([paper({ classId: 'class-2' })], {
        classId: 'class-1',
        subjectId: 'biology',
        programId: PRE_MED,
        examDate: '2026-05-10',
        startTime: '09:00',
      }),
    ).toBeNull()
  })

  it('does not clash a paper that has no date yet', () => {
    expect(
      findPaperConflict([paper()], {
        classId: 'class-1',
        subjectId: 'chemistry',
        programId: PRE_MED,
        startTime: '09:00',
      }),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('a paper’s date against the exam’s own dates', () => {
  const exam = { startDate: '2026-05-10', endDate: '2026-05-20' }

  it('accepts a date inside the range, including both ends', () => {
    expect(isDateWithinExam(exam, '2026-05-10')).toBe(true)
    expect(isDateWithinExam(exam, '2026-05-15')).toBe(true)
    expect(isDateWithinExam(exam, '2026-05-20')).toBe(true)
  })

  it('refuses a date outside it', () => {
    expect(isDateWithinExam(exam, '2026-05-09')).toBe(false)
    expect(isDateWithinExam(exam, '2026-05-21')).toBe(false)
  })

  it('accepts anything when the exam has no dates of its own', () => {
    expect(isDateWithinExam({ startDate: null, endDate: null }, '2026-01-01')).toBe(true)
    expect(isDateWithinExam({ startDate: '2026-05-10', endDate: null }, '2027-01-01')).toBe(true)
  })

  it('accepts a paper with no date yet', () => {
    expect(isDateWithinExam(exam, null)).toBe(true)
    expect(isDateWithinExam(exam)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */

describe('is the date sheet fit to publish', () => {
  it('refuses an exam with no papers', () => {
    const problems = findDateSheetProblems([])
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toContain('no papers')
  })

  it('passes a complete schedule', () => {
    expect(
      findDateSheetProblems([
        paper(),
        paper({ id: 'p2', subjectId: 'chemistry', subjectName: 'Chemistry', examDate: '2026-05-12' }),
      ]),
    ).toEqual([])
  })

  it('reports a paper with no date', () => {
    const problems = findDateSheetProblems([paper({ examDate: null })])
    expect(problems.some((p) => p.message.includes('no date'))).toBe(true)
  })

  it('reports a paper with no start time', () => {
    const problems = findDateSheetProblems([paper({ startTime: null })])
    expect(problems.some((p) => p.message.includes('no start time'))).toBe(true)
  })

  it('reports a paper that ends before it starts', () => {
    const problems = findDateSheetProblems([paper({ startTime: '12:00', endTime: '09:00' })])
    expect(problems.some((p) => p.message.includes('ends before it starts'))).toBe(true)
  })

  it('reports two papers on top of each other', () => {
    const problems = findDateSheetProblems([
      paper(),
      paper({ id: 'p2', subjectId: 'chemistry', subjectName: 'Chemistry', startTime: '10:00', endTime: '13:00' }),
    ])
    expect(problems.some((p) => p.message.includes('overlap'))).toBe(true)
  })

  it('does not report an overlap between different programmes', () => {
    expect(
      findDateSheetProblems([
        paper(),
        paper({
          id: 'p2',
          programId: PRE_ENG,
          programName: 'Pre-Engineering',
          subjectId: 'maths',
          subjectName: 'Mathematics',
        }),
      ]),
    ).toEqual([])
  })

  it('names the paper so an admin knows which one to fix', () => {
    const problems = findDateSheetProblems([paper({ examDate: null })])
    expect(problems[0]?.paperId).toBe('paper-1')
    expect(problems[0]?.message).toContain('Biology')
    expect(problems[0]?.message).toContain('1st Year')
  })
})

/* -------------------------------------------------------------------------- */

describe('the date sheet as it is read', () => {
  it('gives each class and programme its own schedule, in date order', () => {
    const groups = buildDateSheet([
      paper({ id: 'p1', subjectName: 'Biology', examDate: '2026-05-14' }),
      paper({ id: 'p2', subjectName: 'Chemistry', subjectId: 'chemistry', examDate: '2026-05-12' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.programName).toBe('Pre-Medical')
    expect(groups[0]?.entries.map((e) => e.subjectName)).toEqual(['Chemistry', 'Biology'])
  })

  it('shows a whole-class paper in every programme’s schedule', () => {
    // English is sat by everyone, so it belongs on both timetables.
    const groups = buildDateSheet([
      paper({ id: 'p1', subjectId: 'biology', subjectName: 'Biology', examDate: '2026-05-14' }),
      paper({
        id: 'p2',
        programId: PRE_ENG,
        programName: 'Pre-Engineering',
        subjectId: 'maths',
        subjectName: 'Mathematics',
        examDate: '2026-05-14',
      }),
      paper({
        id: 'p3',
        programId: null,
        programName: null,
        subjectId: 'english',
        subjectName: 'English',
        examDate: '2026-05-10',
      }),
    ])

    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(group.entries.map((e) => e.subjectName)).toContain('English')
      // The shared paper is first because it is the earliest date.
      expect(group.entries[0]?.subjectName).toBe('English')
    }
  })

  it('falls back to one combined schedule when no programme has its own paper', () => {
    const groups = buildDateSheet([
      paper({ programId: null, programName: null, subjectId: 'english', subjectName: 'English' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.programName).toBe('All programmes')
    expect(groups[0]?.programId).toBeNull()
  })

  it('sorts unscheduled papers to the end rather than losing them', () => {
    const groups = buildDateSheet([
      paper({ id: 'p1', subjectName: 'Biology', examDate: null, startTime: null }),
      paper({ id: 'p2', subjectId: 'chemistry', subjectName: 'Chemistry', examDate: '2026-05-12' }),
    ])
    expect(groups[0]?.entries.map((e) => e.subjectName)).toEqual(['Chemistry', 'Biology'])
  })

  it('returns nothing for an exam with no papers', () => {
    expect(buildDateSheet([])).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */

describe('when the schedule is open to change', () => {
  it('is editable only while it is a draft', () => {
    expect(isExamEditable('DRAFT')).toBe(true)
    for (const status of ['SCHEDULED', 'MARKS_ENTRY', 'COMPLETED', 'CANCELLED'] as const) {
      expect(isExamEditable(status)).toBe(false)
    }
  })

  it('counts the date sheet as published from SCHEDULED onwards', () => {
    expect(isDateSheetPublished('DRAFT')).toBe(false)
    expect(isDateSheetPublished('CANCELLED')).toBe(false)
    for (const status of ['SCHEDULED', 'MARKS_ENTRY', 'COMPLETED'] as const) {
      expect(isDateSheetPublished(status)).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'

import {
  assignPositions,
  assignPositionsByScope,
  calculateResult,
  rankingGroupKey,
  reportableFigures,
  RANKING_SCOPES,
  type GradeBandInput,
  type RankableResult,
  type RankablePlacement,
  type SubjectMarkInput,
} from '../src/server/exams/grading'

/**
 * Ranking, and the figures a result may report.
 *
 * These run with no database. The service resolves who sat what; everything
 * below is the arithmetic and the rules, so each one can be checked exactly.
 */

const BANDS: GradeBandInput[] = [
  { grade: 'A+', minPercentage: '90.00' },
  { grade: 'A', minPercentage: '80.00' },
  { grade: 'B', minPercentage: '70.00' },
  { grade: 'C', minPercentage: '60.00' },
  { grade: 'D', minPercentage: '50.00' },
  { grade: 'F', minPercentage: '0.00' },
]

/* -------------------------------------------------------------------------- */

describe('the college’s ranking examples', () => {
  const pass = (studentId: string, total: string) =>
    ({ studentId, outcome: 'PASS', totalObtainedMarks: total }) as const
  const fail = (studentId: string, total: string) =>
    ({ studentId, outcome: 'FAIL', totalObtainedMarks: total }) as const
  const incomplete = (studentId: string, total: string) =>
    ({ studentId, outcome: 'INCOMPLETE', totalObtainedMarks: total }) as const

  it('shares a tie and consumes the position behind it: 450, 450, 440 is 1, 1, 3', () => {
    const positions = assignPositions([pass('a', '450'), pass('b', '450'), pass('c', '440')])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(1)
    expect(positions.get('c')).toBe(3)
  })

  it('ranks 450 PASS, 440 FAIL, 430 INCOMPLETE as 1, 2, and no position', () => {
    const positions = assignPositions([
      pass('a', '450'),
      fail('b', '440'),
      incomplete('c', '430'),
    ])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(2)
    expect(positions.get('c')).toBeNull()
  })

  it('never lets a failing student outrank a passing one on marks alone', () => {
    const positions = assignPositions([fail('a', '499'), pass('b', '250')])
    expect(positions.get('b')).toBe(1)
    expect(positions.get('a')).toBe(2)
  })

  it('does not tie a passing student with a failing one on equal marks', () => {
    const positions = assignPositions([pass('a', '300'), fail('b', '300')])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(2)
  })

  it('an incomplete student consumes no position', () => {
    const positions = assignPositions([
      pass('a', '450'),
      incomplete('b', '470'),
      pass('c', '400'),
    ])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('c')).toBe(2)
    expect(positions.get('b')).toBeNull()
  })
})

describe('ranking is deterministic', () => {
  const results: (RankableResult & RankablePlacement)[] = [
    { studentId: 'a', outcome: 'PASS', totalObtainedMarks: '450', sectionId: 's', academicGroupId: 'g', classId: 'c', programId: 'p' },
    { studentId: 'b', outcome: 'PASS', totalObtainedMarks: '450', sectionId: 's', academicGroupId: 'g', classId: 'c', programId: 'p' },
    { studentId: 'c', outcome: 'PASS', totalObtainedMarks: '440', sectionId: 's', academicGroupId: 'g', classId: 'c', programId: 'p' },
  ]

  it('gives the same positions whatever order the rows arrive in', () => {
    // Row order out of the database must never decide between tied students.
    const forwards = assignPositionsByScope(results, 'SECTION')
    const backwards = assignPositionsByScope([...results].reverse(), 'SECTION')
    for (const id of ['a', 'b', 'c']) {
      expect(backwards.get(id)).toBe(forwards.get(id))
    }
    expect(forwards.get('a')).toBe(1)
    expect(forwards.get('b')).toBe(1)
    expect(forwards.get('c')).toBe(3)
  })

  it('compares decimal totals exactly', () => {
    const positions = assignPositions([
      { studentId: 'a', outcome: 'PASS', totalObtainedMarks: '400.50' },
      { studentId: 'b', outcome: 'PASS', totalObtainedMarks: '400.5' },
      { studentId: 'c', outcome: 'PASS', totalObtainedMarks: '400.49' },
    ])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(1)
    expect(positions.get('c')).toBe(3)
  })
})

/* -------------------------------------------------------------------------- */

describe('who a student is ranked against', () => {
  const placement = (over: Partial<RankablePlacement> = {}): RankablePlacement => ({
    sectionId: 'section-a',
    academicGroupId: 'group-1',
    classId: 'class-1',
    programId: 'premed',
    ...over,
  })

  it('keeps programmes apart in every scope', () => {
    // Different courses, different papers, different totals — a position that
    // mixed them would compare two unrelated things.
    for (const scope of RANKING_SCOPES) {
      const premed = rankingGroupKey(scope, placement())
      const preeng = rankingGroupKey(
        scope,
        placement({ programId: 'preeng', academicGroupId: 'group-2', sectionId: 'section-b' }),
      )
      expect(premed).not.toBe(preeng)
    }
  })

  it('SECTION ranks within one section only', () => {
    expect(rankingGroupKey('SECTION', placement())).toBe(
      rankingGroupKey('SECTION', placement({ academicGroupId: 'other' })),
    )
    expect(rankingGroupKey('SECTION', placement())).not.toBe(
      rankingGroupKey('SECTION', placement({ sectionId: 'section-b' })),
    )
  })

  it('GROUP ranks within the class, division and programme', () => {
    expect(rankingGroupKey('GROUP', placement())).toBe(
      rankingGroupKey('GROUP', placement({ sectionId: 'section-b' })),
    )
    expect(rankingGroupKey('GROUP', placement())).not.toBe(
      rankingGroupKey('GROUP', placement({ academicGroupId: 'group-2' })),
    )
  })

  it('CLASS widens across divisions and sections, but not across programmes', () => {
    expect(rankingGroupKey('CLASS', placement())).toBe(
      rankingGroupKey('CLASS', placement({ academicGroupId: 'girls-group', sectionId: 'b' })),
    )
    expect(rankingGroupKey('CLASS', placement())).not.toBe(
      rankingGroupKey('CLASS', placement({ programId: 'preeng' })),
    )
  })

  it('ranks each scope group on its own', () => {
    const positions = assignPositionsByScope(
      [
        { studentId: 'pm-top', outcome: 'PASS', totalObtainedMarks: '300', sectionId: 'a', academicGroupId: 'g1', classId: 'c1', programId: 'premed' },
        { studentId: 'pm-second', outcome: 'PASS', totalObtainedMarks: '200', sectionId: 'a', academicGroupId: 'g1', classId: 'c1', programId: 'premed' },
        { studentId: 'pe-top', outcome: 'PASS', totalObtainedMarks: '250', sectionId: 'b', academicGroupId: 'g2', classId: 'c1', programId: 'preeng' },
      ],
      'GROUP',
    )
    // The Pre-Engineering student is first in their own programme even though a
    // Pre-Medical student scored more.
    expect(positions.get('pm-top')).toBe(1)
    expect(positions.get('pm-second')).toBe(2)
    expect(positions.get('pe-top')).toBe(1)
  })

  it('returns a position for everybody who has one', () => {
    const positions = assignPositionsByScope([], 'GROUP')
    expect(positions.size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */

describe('what an incomplete result may report', () => {
  it('reports nothing that would mislead', () => {
    expect(
      reportableFigures('INCOMPLETE', { percentage: '60.00', grade: 'C', position: 4 }),
    ).toEqual({ percentage: null, grade: null, position: null })
  })

  it('leaves a complete result exactly as it is', () => {
    const figures = { percentage: '82.50', grade: 'A', position: 1 }
    expect(reportableFigures('PASS', figures)).toEqual(figures)
    expect(reportableFigures('FAIL', { percentage: '30.00', grade: 'F', position: 9 })).toEqual({
      percentage: '30.00',
      grade: 'F',
      position: 9,
    })
  })
})

/* -------------------------------------------------------------------------- */

describe('the overall rules, on whole results', () => {
  const paper = (name: string, obtained: string | null, status: SubjectMarkInput['status'] = 'ENTERED'): SubjectMarkInput => ({
    examPaperId: `paper-${name}`,
    subjectId: name,
    subjectName: name,
    maxMarks: '100',
    passingPercentage: '50',
    status,
    obtainedMarks: obtained,
  })

  it('passes the college’s worked example: 60, 55, 70 is 61.67% and a PASS', () => {
    const result = calculateResult(
      [paper('Biology', '60'), paper('Physics', '55'), paper('Chemistry', '70')],
      BANDS,
    )
    expect(result.percentage).toBe('61.67')
    expect(result.outcome).toBe('PASS')
  })

  it('fails the college’s second example: one subject at 49 fails the whole result', () => {
    const result = calculateResult(
      [paper('Biology', '60'), paper('Physics', '49'), paper('Chemistry', '80')],
      BANDS,
    )
    expect(result.percentage).toBe('63.00')
    expect(result.outcome).toBe('FAIL')
  })

  it('fails when every subject passes but the total falls short', () => {
    // Each paper passes on its own 40% rule; the total does not reach 50%.
    const subjects = [paper('A', '45'), paper('B', '45'), paper('C', '45')].map((s) => ({
      ...s,
      passingPercentage: '40',
    }))
    const result = calculateResult(subjects, BANDS)
    expect(result.failedSubjectCount).toBe(0)
    expect(result.percentage).toBe('45.00')
    expect(result.outcome).toBe('FAIL')
  })

  it('passes at exactly 50% of the total', () => {
    const result = calculateResult([paper('A', '50'), paper('B', '50')], BANDS)
    expect(result.percentage).toBe('50.00')
    expect(result.outcome).toBe('PASS')
  })

  it('fails an absent student, and keeps the absence visible', () => {
    const result = calculateResult(
      [paper('Biology', '90'), paper('Physics', '0', 'ABSENT'), paper('Chemistry', '90')],
      BANDS,
    )
    const absent = result.subjects.find((s) => s.subjectName === 'Physics')
    expect(absent?.status).toBe('ABSENT')
    expect(absent?.obtainedMarks).toBe('0.00')
    expect(absent?.grade).toBe('F')
    expect(absent?.outcome).toBe('FAIL')
    // Two papers at 90 would otherwise be a comfortable pass.
    expect(result.outcome).toBe('FAIL')
  })

  it('is INCOMPLETE, with no grade, when a paper has no mark', () => {
    const result = calculateResult(
      [paper('Biology', '90'), paper('Physics', null, 'PENDING')],
      BANDS,
    )
    expect(result.outcome).toBe('INCOMPLETE')
    expect(result.grade).toBeNull()
    const pending = result.subjects.find((s) => s.subjectName === 'Physics')
    // Never scored as a zero.
    expect(pending?.obtainedMarks).toBeNull()
    expect(pending?.percentage).toBeNull()
  })

  it('reports nothing misleading for that incomplete student', () => {
    const result = calculateResult(
      [paper('Biology', '90'), paper('Physics', null, 'PENDING')],
      BANDS,
    )
    const shown = reportableFigures(result.outcome, {
      percentage: result.percentage,
      grade: result.grade,
      position: 3,
    })
    expect(shown).toEqual({ percentage: null, grade: null, position: null })
  })
})

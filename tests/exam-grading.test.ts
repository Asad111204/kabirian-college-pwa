import { describe, expect, it } from 'vitest'

import {
  fromHundredths,
  percentageHundredths,
  reachesPercentage,
  toHundredths,
} from '../src/server/exams/exact'
import {
  type GradeBandInput,
  type SubjectMarkInput,
  assignPositions,
  calculateResult,
  calculateSubject,
  findGrade,
} from '../src/server/exams/grading'

/**
 * The result rules the college confirmed.
 *
 * These run with no database at all — the whole point of keeping the
 * calculation pure. A wrong answer here decides a student's year, so the
 * boundaries are tested at the exact value, one hundredth below it, and one
 * hundredth above.
 */

/** The seeded Kabirian College scale. */
const BANDS: GradeBandInput[] = [
  { grade: 'A+', minPercentage: '90.00' },
  { grade: 'A', minPercentage: '80.00' },
  { grade: 'B', minPercentage: '70.00' },
  { grade: 'C', minPercentage: '60.00' },
  { grade: 'D', minPercentage: '50.00' },
  { grade: 'F', minPercentage: '0.00' },
]

/** A paper out of 100 with the usual 50% pass mark. */
function paper(over: Partial<SubjectMarkInput> = {}): SubjectMarkInput {
  return {
    examPaperId: 'paper-1',
    subjectId: 'subject-1',
    subjectName: 'Biology',
    maxMarks: '100',
    passingPercentage: '50',
    status: 'ENTERED',
    obtainedMarks: '50',
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('exact arithmetic', () => {
  it('reads a decimal as whole hundredths', () => {
    expect(toHundredths('82.5')).toBe(8250)
    expect(toHundredths('82.50')).toBe(8250)
    expect(toHundredths(82.5)).toBe(8250)
    expect(toHundredths('100')).toBe(10_000)
    expect(toHundredths('0')).toBe(0)
  })

  it('refuses anything that is not a mark', () => {
    // Rounding 82.567 to 82.57 would hide the bug that produced it.
    expect(() => toHundredths('82.567')).toThrow()
    expect(() => toHundredths('-5')).toThrow()
    expect(() => toHundredths('')).toThrow()
    expect(() => toHundredths('abc')).toThrow()
    expect(() => toHundredths('1e3')).toThrow()
  })

  it('always writes two decimal places back', () => {
    expect(fromHundredths(8250)).toBe('82.50')
    expect(fromHundredths(10_000)).toBe('100.00')
    expect(fromHundredths(5)).toBe('0.05')
    expect(fromHundredths(0)).toBe('0.00')
  })

  it('does not drift the way floating point does', () => {
    // 0.1 + 0.2 !== 0.3 in JavaScript. In hundredths it simply does.
    const total = toHundredths('0.1') + toHundredths('0.2')
    expect(fromHundredths(total)).toBe('0.30')
  })

  it('rounds a percentage half up, for display only', () => {
    expect(percentageHundredths(toHundredths('82.5'), toHundredths('100'))).toBe(8250)
    // 1 out of 3 is 33.333...%, and 2 out of 3 is 66.666...%.
    expect(fromHundredths(percentageHundredths(toHundredths('1'), toHundredths('3')))).toBe('33.33')
    expect(fromHundredths(percentageHundredths(toHundredths('2'), toHundredths('3')))).toBe('66.67')
  })

  it('compares percentages exactly rather than through the rounded value', () => {
    const max = toHundredths('100')
    expect(reachesPercentage(toHundredths('50'), max, toHundredths('50'))).toBe(true)
    expect(reachesPercentage(toHundredths('49.99'), max, toHundredths('50'))).toBe(false)
  })

  it('refuses to divide by a zero maximum', () => {
    expect(() => percentageHundredths(100, 0)).toThrow()
    expect(() => reachesPercentage(100, 0, 5000)).toThrow()
  })
})

/* -------------------------------------------------------------------------- */

describe('grades', () => {
  const gradeFor = (marks: string) =>
    findGrade(BANDS, toHundredths(marks), toHundredths('100'))

  it('gives the confirmed grade at each band', () => {
    expect(gradeFor('95')).toBe('A+')
    expect(gradeFor('85')).toBe('A')
    expect(gradeFor('75')).toBe('B')
    expect(gradeFor('65')).toBe('C')
    expect(gradeFor('55')).toBe('D')
    expect(gradeFor('49.99')).toBe('F')
  })

  it('places every boundary in the higher band', () => {
    expect(gradeFor('90')).toBe('A+')
    expect(gradeFor('89.99')).toBe('A')
    expect(gradeFor('80')).toBe('A')
    expect(gradeFor('79.99')).toBe('B')
    expect(gradeFor('70')).toBe('B')
    expect(gradeFor('69.99')).toBe('C')
    expect(gradeFor('60')).toBe('C')
    expect(gradeFor('59.99')).toBe('D')
    expect(gradeFor('50')).toBe('D')
    expect(gradeFor('0')).toBe('F')
    expect(gradeFor('100')).toBe('A+')
  })

  it('leaves no gap between bands the college wrote as 80-89', () => {
    // The literal reading would leave 89.50 ungraded. Matching on the lower
    // bound means it is an A.
    expect(gradeFor('89.5')).toBe('A')
    expect(gradeFor('89.01')).toBe('A')
  })

  it('does not promote a mark that only rounds up to the boundary', () => {
    // 269.99 out of 300 is 89.996...%, which displays as 90.00 but has not
    // reached 90. It is an A.
    const grade = findGrade(BANDS, toHundredths('269.99'), toHundredths('300'))
    const shown = fromHundredths(percentageHundredths(toHundredths('269.99'), toHundredths('300')))
    expect(shown).toBe('90.00')
    expect(grade).toBe('A')
  })

  it('returns nothing when the scale does not cover the mark', () => {
    expect(findGrade([{ grade: 'A+', minPercentage: '90' }], toHundredths('10'), toHundredths('100'))).toBeNull()
    expect(findGrade([], toHundredths('90'), toHundredths('100'))).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('one subject', () => {
  it('passes at exactly the passing mark and fails one hundredth below', () => {
    expect(calculateSubject(paper({ obtainedMarks: '50' }), BANDS).outcome).toBe('PASS')
    expect(calculateSubject(paper({ obtainedMarks: '49.99' }), BANDS).outcome).toBe('FAIL')
  })

  it('keeps a decimal mark exact', () => {
    const entry = calculateSubject(paper({ obtainedMarks: '82.5' }), BANDS)
    expect(entry.obtainedMarks).toBe('82.50')
    expect(entry.percentage).toBe('82.50')
    expect(entry.grade).toBe('A')
    expect(entry.outcome).toBe('PASS')
  })

  it('does not decide a pass from the rounded percentage', () => {
    // 149.99 out of 300 is 49.9966...%, which displays as 50.00. The student
    // has not reached half marks, so they fail.
    const entry = calculateSubject(
      paper({ maxMarks: '300', obtainedMarks: '149.99' }),
      BANDS,
    )
    expect(entry.percentage).toBe('50.00')
    expect(entry.outcome).toBe('FAIL')
  })

  it('scores an absent student zero, and says they were absent', () => {
    const entry = calculateSubject(paper({ status: 'ABSENT', obtainedMarks: '0' }), BANDS)
    expect(entry.status).toBe('ABSENT')
    expect(entry.obtainedMarks).toBe('0.00')
    expect(entry.percentage).toBe('0.00')
    expect(entry.grade).toBe('F')
    expect(entry.outcome).toBe('FAIL')
  })

  it('never turns a missing mark into a zero', () => {
    const entry = calculateSubject(paper({ status: 'PENDING', obtainedMarks: null }), BANDS)
    expect(entry.obtainedMarks).toBeNull()
    expect(entry.percentage).toBeNull()
    expect(entry.grade).toBeNull()
    expect(entry.outcome).toBe('PENDING')
  })

  it('honours a paper with its own passing percentage', () => {
    const entry = calculateSubject(paper({ passingPercentage: '40', obtainedMarks: '40' }), BANDS)
    expect(entry.outcome).toBe('PASS')
    expect(entry.grade).toBe('F')
  })

  it('refuses marks that contradict their status', () => {
    expect(() => calculateSubject(paper({ status: 'PENDING', obtainedMarks: '10' }), BANDS)).toThrow()
    expect(() => calculateSubject(paper({ status: 'ENTERED', obtainedMarks: null }), BANDS)).toThrow()
    expect(() => calculateSubject(paper({ status: 'ABSENT', obtainedMarks: '40' }), BANDS)).toThrow()
  })

  it('refuses a mark above the paper maximum instead of guessing', () => {
    expect(() => calculateSubject(paper({ obtainedMarks: '101' }), BANDS)).toThrow()
  })

  it('refuses a paper worth nothing', () => {
    expect(() => calculateSubject(paper({ maxMarks: '0' }), BANDS)).toThrow()
  })
})

/* -------------------------------------------------------------------------- */

describe('the whole result', () => {
  const five = (marks: string[], status: 'ENTERED' | 'ABSENT' | 'PENDING' = 'ENTERED') =>
    marks.map((m, i) =>
      paper({
        examPaperId: `paper-${i + 1}`,
        subjectId: `subject-${i + 1}`,
        subjectName: `Subject ${i + 1}`,
        status: m === '' ? 'PENDING' : status,
        obtainedMarks: m === '' ? null : m,
      }),
    )

  it('passes a student who passes every subject and the total', () => {
    const result = calculateResult(five(['90', '80', '70', '60', '50']), BANDS)
    expect(result.totalMaxMarks).toBe('500.00')
    expect(result.totalObtainedMarks).toBe('350.00')
    expect(result.percentage).toBe('70.00')
    expect(result.grade).toBe('B')
    expect(result.outcome).toBe('PASS')
    expect(result.failedSubjectCount).toBe(0)
  })

  it('fails a student who fails one subject however high the total', () => {
    // 419 out of 500 is 83.8%, but Subject 5 is below half marks.
    const result = calculateResult(five(['100', '100', '100', '100', '19']), BANDS)
    expect(result.percentage).toBe('83.80')
    expect(result.failedSubjectCount).toBe(1)
    expect(result.outcome).toBe('FAIL')
  })

  it('fails a student who passes every subject but not the total', () => {
    // Every paper here passes at its own 40%, yet the total is under half.
    const subjects = five(['40', '40', '40', '40', '40']).map((s) => ({
      ...s,
      passingPercentage: '40',
    }))
    const result = calculateResult(subjects, BANDS)
    expect(result.failedSubjectCount).toBe(0)
    expect(result.percentage).toBe('40.00')
    expect(result.outcome).toBe('FAIL')
  })

  it('passes at exactly half the total', () => {
    const result = calculateResult(five(['50', '50', '50', '50', '50']), BANDS)
    expect(result.percentage).toBe('50.00')
    expect(result.grade).toBe('D')
    expect(result.outcome).toBe('PASS')
  })

  it('fails a student who was absent for one paper', () => {
    const subjects = five(['100', '100', '100', '100', '100'])
    subjects[4] = paper({
      examPaperId: 'paper-5',
      subjectId: 'subject-5',
      subjectName: 'Subject 5',
      status: 'ABSENT',
      obtainedMarks: '0',
    })
    const result = calculateResult(subjects, BANDS)
    expect(result.totalObtainedMarks).toBe('400.00')
    expect(result.outcome).toBe('FAIL')
    expect(result.subjects[4]?.status).toBe('ABSENT')
  })

  it('is INCOMPLETE while any mark is missing, with no grade', () => {
    const result = calculateResult(five(['90', '80', '70', '60', '']), BANDS)
    expect(result.pendingSubjectCount).toBe(1)
    expect(result.outcome).toBe('INCOMPLETE')
    expect(result.grade).toBeNull()
    // The maximum still counts the unmarked paper, so the figure can only rise.
    expect(result.totalMaxMarks).toBe('500.00')
    expect(result.totalObtainedMarks).toBe('300.00')
    expect(result.percentage).toBe('60.00')
  })

  it('is INCOMPLETE even when what is marked would already fail', () => {
    const result = calculateResult(five(['10', '10', '10', '10', '']), BANDS)
    expect(result.outcome).toBe('INCOMPLETE')
  })

  it('adds decimal marks without drifting', () => {
    const result = calculateResult(five(['82.5', '77.25', '60.1', '55.05', '90.1']), BANDS)
    expect(result.totalObtainedMarks).toBe('365.00')
    expect(result.percentage).toBe('73.00')
  })

  it('refuses to invent a result for a student with no papers', () => {
    expect(() => calculateResult([], BANDS)).toThrow()
  })
})

/* -------------------------------------------------------------------------- */

describe('positions', () => {
  const pass = (studentId: string, total: string) =>
    ({ studentId, outcome: 'PASS', totalObtainedMarks: total }) as const
  const fail = (studentId: string, total: string) =>
    ({ studentId, outcome: 'FAIL', totalObtainedMarks: total }) as const

  it('ranks by total marks, highest first', () => {
    const positions = assignPositions([pass('a', '400'), pass('b', '450'), pass('c', '380')])
    expect(positions.get('b')).toBe(1)
    expect(positions.get('a')).toBe(2)
    expect(positions.get('c')).toBe(3)
  })

  it('shares a position on a tie and skips the one behind it', () => {
    // The college's example: 450, 450, 440 is 1st, 1st, 3rd.
    const positions = assignPositions([pass('a', '450'), pass('b', '450'), pass('c', '440')])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(1)
    expect(positions.get('c')).toBe(3)
  })

  it('handles a tie further down the list', () => {
    const positions = assignPositions([
      pass('a', '480'),
      pass('b', '450'),
      pass('c', '450'),
      pass('d', '450'),
      pass('e', '400'),
    ])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(2)
    expect(positions.get('c')).toBe(2)
    expect(positions.get('d')).toBe(2)
    expect(positions.get('e')).toBe(5)
  })

  it('puts every passing student ahead of every failing one', () => {
    const positions = assignPositions([fail('a', '490'), pass('b', '260')])
    expect(positions.get('b')).toBe(1)
    expect(positions.get('a')).toBe(2)
  })

  it('does not tie a passing student with a failing one on equal marks', () => {
    const positions = assignPositions([pass('a', '300'), fail('b', '300')])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(2)
  })

  it('gives an INCOMPLETE result no position at all', () => {
    const positions = assignPositions([
      pass('a', '450'),
      { studentId: 'b', outcome: 'INCOMPLETE', totalObtainedMarks: '470' },
      pass('c', '400'),
    ])
    expect(positions.get('b')).toBeNull()
    // The incomplete student does not consume a position either.
    expect(positions.get('a')).toBe(1)
    expect(positions.get('c')).toBe(2)
  })

  it('compares decimal totals exactly', () => {
    const positions = assignPositions([pass('a', '400.50'), pass('b', '400.5'), pass('c', '400.49')])
    expect(positions.get('a')).toBe(1)
    expect(positions.get('b')).toBe(1)
    expect(positions.get('c')).toBe(3)
  })

  it('returns an empty ranking for no students', () => {
    expect(assignPositions([]).size).toBe(0)
  })
})

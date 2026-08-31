import { describe, expect, it } from 'vitest'

import { Prisma } from '../src/generated/prisma/client'
import {
  calculateResult,
  reportableFigures,
  type GradeBandInput,
  type OverallOutcome,
  type SubjectMarkInput,
} from '../src/server/exams/grading'

/**
 * An INCOMPLETE result has no percentage.
 *
 * The column used to be NOT NULL, so a student whose papers were not all marked
 * had to be stored with *some* figure — the share they had scored so far, which
 * reads as a score and is not one. The column is now nullable, a CHECK
 * constraint ties it to the outcome, and `reportableFigures` is the single rule
 * both the write path and the read path go through.
 *
 * The database half of this is in exam-schema.test.ts, which applies every
 * migration to a real PostgreSQL and proves the constraint refuses each way
 * round.
 */

const BANDS: GradeBandInput[] = [
  { grade: 'A+', minPercentage: '90.00' },
  { grade: 'A', minPercentage: '80.00' },
  { grade: 'B', minPercentage: '70.00' },
  { grade: 'C', minPercentage: '60.00' },
  { grade: 'D', minPercentage: '50.00' },
  { grade: 'F', minPercentage: '0.00' },
]

const paper = (
  name: string,
  obtained: string | null,
  status: SubjectMarkInput['status'] = 'ENTERED',
): SubjectMarkInput => ({
  examPaperId: `paper-${name}`,
  subjectId: name,
  subjectName: name,
  maxMarks: '100',
  passingPercentage: '50',
  status,
  obtainedMarks: obtained,
})

/** What the service stores, and what it reports: the same rule at both ends. */
const stored = (outcome: OverallOutcome, percentage: string, grade: string | null, position: number | null) =>
  reportableFigures(outcome, { percentage, grade, position })

/* -------------------------------------------------------------------------- */

describe('a PASS keeps its percentage', () => {
  it('reports the figure it was calculated with', () => {
    const result = calculateResult([paper('A', '90'), paper('B', '90')], BANDS)
    expect(result.outcome).toBe('PASS')

    const shown = stored(result.outcome, result.percentage, result.grade, 1)
    expect(shown.percentage).toBe('90.00')
    expect(shown.grade).toBe('A+')
    expect(shown.position).toBe(1)
  })
})

describe('a FAIL keeps its percentage', () => {
  it('reports the figure it was calculated with', () => {
    // 60, 49, 80: one subject below half, so the whole result fails.
    const result = calculateResult(
      [paper('A', '60'), paper('B', '49'), paper('C', '80')],
      BANDS,
    )
    expect(result.outcome).toBe('FAIL')

    const shown = stored(result.outcome, result.percentage, result.grade, 4)
    expect(shown.percentage).toBe('63.00')
    expect(shown.grade).toBe('C')
    expect(shown.position).toBe(4)
  })

  it('keeps a failing percentage even at the very bottom', () => {
    const result = calculateResult([paper('A', '0'), paper('B', '0')], BANDS)
    const shown = stored(result.outcome, result.percentage, result.grade, 9)
    expect(result.outcome).toBe('FAIL')
    expect(shown.percentage).toBe('0.00')
    expect(shown.grade).toBe('F')
  })
})

describe('an INCOMPLETE result has none of the three', () => {
  const incomplete = calculateResult(
    [paper('A', '90'), paper('B', null, 'PENDING')],
    BANDS,
  )

  it('is INCOMPLETE to begin with', () => {
    expect(incomplete.outcome).toBe('INCOMPLETE')
  })

  it('reports no percentage', () => {
    expect(stored(incomplete.outcome, incomplete.percentage, incomplete.grade, 2).percentage).toBeNull()
  })

  it('reports no grade', () => {
    // The calculation already withholds it; the rule withholds it again.
    expect(incomplete.grade).toBeNull()
    expect(stored(incomplete.outcome, incomplete.percentage, 'A+', 2).grade).toBeNull()
  })

  it('reports no position', () => {
    expect(stored(incomplete.outcome, incomplete.percentage, incomplete.grade, 2).position).toBeNull()
  })

  it('cannot accidentally receive a percentage', () => {
    // Even handed a complete-looking set of figures, the rule blanks them.
    expect(reportableFigures('INCOMPLETE', { percentage: '75.00', grade: 'B', position: 1 })).toEqual({
      percentage: null,
      grade: null,
      position: null,
    })
  })

  it('never reports zero instead', () => {
    const shown = stored(incomplete.outcome, incomplete.percentage, incomplete.grade, null)
    expect(shown.percentage).not.toBe('0.00')
    expect(shown.percentage).not.toBe('0')
    expect(shown.percentage).toBeNull()
  })

  it('leaves the marks that were entered alone', () => {
    // The totals are real and stay; only the *result* figures are withheld.
    expect(incomplete.totalObtainedMarks).toBe('90.00')
    expect(incomplete.totalMaxMarks).toBe('200.00')
    expect(incomplete.subjects[0]?.obtainedMarks).toBe('90.00')
    expect(incomplete.subjects[1]?.obtainedMarks).toBeNull()
  })
})

describe('nothing about a complete result changed', () => {
  it('passes every figure through untouched', () => {
    for (const outcome of ['PASS', 'FAIL'] as const) {
      const figures = { percentage: '82.50', grade: 'A', position: 3 }
      expect(reportableFigures(outcome, figures)).toEqual(figures)
    }
  })

  it('still allows a null grade on a complete result', () => {
    // A scale that does not cover the mark yields no grade; that is not the
    // same thing as an incomplete result, and it is left alone.
    expect(reportableFigures('PASS', { percentage: '95.00', grade: null, position: 1 })).toEqual({
      percentage: '95.00',
      grade: null,
      position: 1,
    })
  })
})

/* -------------------------------------------------------------------------- */

describe('percentages read to two decimal places', () => {
  it('comes out of the calculation with both places', () => {
    const half = calculateResult([paper('A', '50')], BANDS)
    expect(half.percentage).toBe('50.00')

    const ninety = calculateResult([paper('A', '90')], BANDS)
    expect(ninety.percentage).toBe('90.00')

    // 60 + 55 + 70 out of 300 is 61.666…%, rounded half up for display.
    const third = calculateResult([paper('A', '60'), paper('B', '55'), paper('C', '70')], BANDS)
    expect(third.percentage).toBe('61.67')
  })

  it('survives the round trip through the DECIMAL column', () => {
    // Prisma's Decimal.toString() drops trailing zeros — "90" rather than
    // "90.00" — which is why the service reads it with toFixed(2). This is
    // exact decimal arithmetic, not floating point.
    for (const [storedValue, reported] of [
      ['50', '50.00'],
      ['50.00', '50.00'],
      ['90', '90.00'],
      ['61.67', '61.67'],
      ['82.5', '82.50'],
      ['0', '0.00'],
      ['100', '100.00'],
    ] as const) {
      expect(new Prisma.Decimal(storedValue).toFixed(2)).toBe(reported)
    }
  })

  it('does not drift the way a float would', () => {
    // 0.1 + 0.2 !== 0.3 in JavaScript; in a Decimal it does.
    expect(new Prisma.Decimal('0.1').plus('0.2').toFixed(2)).toBe('0.30')
  })
})

import { describe, expect, it } from 'vitest'

import {
  MARK_SHEET_STATUSES,
  MARK_STATUSES,
  markRowSchema,
  openMarkSheetSchema,
  saveMarksSchema,
} from '../src/validation/marks'

/**
 * The shape of a mark, checked with the same schema the API uses.
 *
 * The three states are the point: a missing mark, a mark of zero and an absence
 * are three different things, and no combination that blurs them is accepted.
 * Whether a value fits the paper needs the paper's maximum, so that check lives
 * in the service — these are the rules that hold whatever the paper is worth.
 */

const STUDENT = '11111111-1111-4111-8111-111111111111'
const row = (over: Record<string, unknown> = {}) => ({ studentId: STUDENT, ...over })

/* -------------------------------------------------------------------------- */

describe('the three states', () => {
  it('mirrors the database enums exactly', () => {
    expect([...MARK_STATUSES]).toEqual(['PENDING', 'ENTERED', 'ABSENT'])
    expect([...MARK_SHEET_STATUSES]).toEqual(['DRAFT', 'SUBMITTED', 'PUBLISHED'])
  })

  it('refuses a status nobody defined', () => {
    expect(markRowSchema.safeParse(row({ status: 'EXCUSED' })).success).toBe(false)
    expect(markRowSchema.safeParse(row({ status: 'LATE' })).success).toBe(false)
  })
})

describe('PENDING — nobody has entered a mark', () => {
  it('is accepted with no value at all', () => {
    expect(markRowSchema.safeParse(row({ status: 'PENDING' })).success).toBe(true)
    expect(markRowSchema.safeParse(row({ status: 'PENDING', obtainedMarks: '' })).success).toBe(true)
    expect(markRowSchema.safeParse(row({ status: 'PENDING', obtainedMarks: null })).success).toBe(
      true,
    )
  })

  it('is refused with a value, including zero', () => {
    // A missing mark must never be storable as a zero.
    expect(markRowSchema.safeParse(row({ status: 'PENDING', obtainedMarks: '0' })).success).toBe(
      false,
    )
    expect(markRowSchema.safeParse(row({ status: 'PENDING', obtainedMarks: '50' })).success).toBe(
      false,
    )
  })
})

describe('ENTERED — a real mark', () => {
  it('accepts whole and decimal marks', () => {
    for (const marks of ['0', '10', '25.5', '47.5', '78.25', '99.5', '100']) {
      expect(markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: marks })).success).toBe(
        true,
      )
    }
  })

  it('refuses a missing value', () => {
    expect(markRowSchema.safeParse(row({ status: 'ENTERED' })).success).toBe(false)
    expect(markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: '' })).success).toBe(
      false,
    )
    expect(markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: null })).success).toBe(
      false,
    )
  })

  it('refuses a negative mark', () => {
    expect(markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: '-1' })).success).toBe(
      false,
    )
  })

  it('refuses a third decimal place, because the column holds two', () => {
    expect(
      markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: '47.555' })).success,
    ).toBe(false)
  })

  it('refuses anything that is not a number', () => {
    for (const marks of ['abc', '1e2', '50%', '5 0']) {
      expect(markRowSchema.safeParse(row({ status: 'ENTERED', obtainedMarks: marks })).success).toBe(
        false,
      )
    }
  })
})

describe('ABSENT — did not sit the paper', () => {
  it('is accepted scoring zero', () => {
    expect(markRowSchema.safeParse(row({ status: 'ABSENT', obtainedMarks: '0' })).success).toBe(true)
    expect(markRowSchema.safeParse(row({ status: 'ABSENT', obtainedMarks: '0.00' })).success).toBe(
      true,
    )
  })

  it('is accepted with the value left off, since the server writes the zero', () => {
    expect(markRowSchema.safeParse(row({ status: 'ABSENT' })).success).toBe(true)
    expect(markRowSchema.safeParse(row({ status: 'ABSENT', obtainedMarks: '' })).success).toBe(true)
  })

  it('is refused with any other mark', () => {
    expect(markRowSchema.safeParse(row({ status: 'ABSENT', obtainedMarks: '10' })).success).toBe(
      false,
    )
    expect(markRowSchema.safeParse(row({ status: 'ABSENT', obtainedMarks: '0.01' })).success).toBe(
      false,
    )
  })
})

describe('the student id', () => {
  it('must be a real identifier', () => {
    expect(markRowSchema.safeParse({ studentId: 'student-1', status: 'PENDING' }).success).toBe(
      false,
    )
    expect(markRowSchema.safeParse({ studentId: '', status: 'PENDING' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('saving a whole sheet', () => {
  const rows = [row({ status: 'ENTERED', obtainedMarks: '75' })]

  it('accepts a sheet of rows', () => {
    expect(saveMarksSchema.safeParse({ rows }).success).toBe(true)
  })

  it('refuses an empty save', () => {
    expect(saveMarksSchema.safeParse({ rows: [] }).success).toBe(false)
  })

  it('refuses more rows than any section holds', () => {
    const many = Array.from({ length: 501 }, () => rows[0]!)
    expect(saveMarksSchema.safeParse({ rows: many }).success).toBe(false)
  })

  it('refuses the whole save when one row is wrong', () => {
    // Atomic by design: a half-saved sheet leaves the teacher unable to tell
    // which marks went in.
    const mixed = [rows[0]!, row({ status: 'ABSENT', obtainedMarks: '10' })]
    expect(saveMarksSchema.safeParse({ rows: mixed }).success).toBe(false)
  })

  it('carries an optional timestamp for detecting a concurrent change', () => {
    expect(
      saveMarksSchema.safeParse({ rows, expectedUpdatedAt: '2026-08-31T10:00:00.000Z' }).success,
    ).toBe(true)
    expect(saveMarksSchema.safeParse({ rows, expectedUpdatedAt: 'yesterday' }).success).toBe(false)
  })
})

describe('opening a mark sheet', () => {
  const SECTION = '22222222-2222-4222-8222-222222222222'

  it('takes one paper and one section, and nothing else', () => {
    const parsed = openMarkSheetSchema.safeParse({
      examPaperId: STUDENT,
      sectionId: SECTION,
      // A forged teacher id is simply not part of the shape.
      staffId: 'someone-else',
      subjectId: 'chemistry',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual(['examPaperId', 'sectionId'])
    }
  })

  it('requires both ids', () => {
    expect(openMarkSheetSchema.safeParse({ examPaperId: STUDENT }).success).toBe(false)
    expect(openMarkSheetSchema.safeParse({ sectionId: SECTION }).success).toBe(false)
    expect(
      openMarkSheetSchema.safeParse({ examPaperId: 'paper-1', sectionId: SECTION }).success,
    ).toBe(false)
  })
})

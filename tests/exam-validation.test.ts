import { describe, expect, it } from 'vitest'

import {
  clockTime,
  dateSheetPublishSchema,
  examCreateSchema,
  examListQuerySchema,
  examPaperCreateSchema,
  examStatusSchema,
  examTypeCreateSchema,
  marksValue,
  percentageValue,
} from '../src/validation/exams'
import { ROLE_DEFAULT_PERMISSIONS } from '../src/server/auth/permissions'

/**
 * The exam forms, checked with the same schemas the API uses.
 *
 * The browser copy of these is a convenience; this is the copy that decides
 * whether a request is well formed. Whether the ids in it belong together is a
 * separate question, settled in the service against the database.
 */

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'

/* -------------------------------------------------------------------------- */

describe('maximum marks', () => {
  it('accepts whole and decimal totals', () => {
    for (const value of ['100', '50', '87.5', '87.50', '0.5', '1000']) {
      expect(marksValue.safeParse(value).success).toBe(true)
    }
  })

  it('refuses zero, negatives and nonsense', () => {
    for (const value of ['0', '0.00', '-5', 'abc', '', '1e3', '100,00']) {
      expect(marksValue.safeParse(value).success).toBe(false)
    }
  })

  it('refuses a third decimal place rather than rounding it away', () => {
    // The column holds two. Silently rounding would hide the bug upstream.
    expect(marksValue.safeParse('87.555').success).toBe(false)
  })

  it('refuses a total the DECIMAL(6,2) column could not hold', () => {
    expect(marksValue.safeParse('9999.99').success).toBe(true)
    expect(marksValue.safeParse('10000').success).toBe(false)
  })
})

describe('passing percentage', () => {
  it('accepts a percentage, whole or decimal', () => {
    for (const value of ['50', '33.33', '0', '100', '100.00']) {
      expect(percentageValue.safeParse(value).success).toBe(true)
    }
  })

  it('refuses more than 100 and anything negative', () => {
    expect(percentageValue.safeParse('100.01').success).toBe(false)
    expect(percentageValue.safeParse('101').success).toBe(false)
    expect(percentageValue.safeParse('-1').success).toBe(false)
  })
})

describe('a time on a clock face', () => {
  it('accepts 24-hour times', () => {
    for (const value of ['00:00', '09:00', '13:45', '23:59']) {
      expect(clockTime.safeParse(value).success).toBe(true)
    }
  })

  it('refuses anything else', () => {
    for (const value of ['9:00', '24:00', '09:60', '9am', '09-00', '']) {
      expect(clockTime.safeParse(value).success).toBe(false)
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('creating an exam', () => {
  const valid = {
    name: 'First Term Examination 2026',
    examTypeId: UUID_A,
    academicSessionId: UUID_B,
    startDate: '2026-05-10',
    endDate: '2026-05-20',
    description: '',
  }

  it('accepts a well-formed exam', () => {
    const parsed = examCreateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.description).toBeUndefined()
  })

  it('requires a name, a type and a session', () => {
    expect(examCreateSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false)
    expect(examCreateSchema.safeParse({ ...valid, examTypeId: 'not-a-uuid' }).success).toBe(false)
    expect(examCreateSchema.safeParse({ ...valid, academicSessionId: '' }).success).toBe(false)
  })

  it('refuses an exam that ends before it starts', () => {
    const parsed = examCreateSchema.safeParse({
      ...valid,
      startDate: '2026-05-20',
      endDate: '2026-05-10',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'endDate')).toBe(true)
    }
  })

  it('accepts an exam that starts and ends on the same day', () => {
    expect(
      examCreateSchema.safeParse({ ...valid, startDate: '2026-05-10', endDate: '2026-05-10' })
        .success,
    ).toBe(true)
  })

  it('accepts an exam with no dates yet', () => {
    expect(examCreateSchema.safeParse({ ...valid, startDate: '', endDate: '' }).success).toBe(true)
  })

  it('refuses a date that is not a calendar date', () => {
    expect(examCreateSchema.safeParse({ ...valid, startDate: '10-05-2026' }).success).toBe(false)
  })

  it('has no status field, so a form can never cancel or publish', () => {
    const parsed = examCreateSchema.safeParse({ ...valid, status: 'COMPLETED' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('status' in parsed.data).toBe(false)
  })
})

describe('changing an exam’s state', () => {
  it('allows only cancelling and returning to draft', () => {
    expect(examStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(true)
    expect(examStatusSchema.safeParse({ status: 'DRAFT' }).success).toBe(true)
    // Publishing is the date sheet's own action, with its own validation.
    for (const status of ['SCHEDULED', 'MARKS_ENTRY', 'COMPLETED']) {
      expect(examStatusSchema.safeParse({ status }).success).toBe(false)
    }
  })

  it('requires an explicit publish or withdraw', () => {
    expect(dateSheetPublishSchema.safeParse({ publish: true }).success).toBe(true)
    expect(dateSheetPublishSchema.safeParse({ publish: false }).success).toBe(true)
    expect(dateSheetPublishSchema.safeParse({}).success).toBe(false)
    expect(dateSheetPublishSchema.safeParse({ publish: 'yes' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('exam types', () => {
  it('accepts a name and a code', () => {
    const parsed = examTypeCreateSchema.safeParse({ name: 'First Term', code: 't1' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.code).toBe('T1')
      expect(parsed.data.isActive).toBe(true)
    }
  })

  it('requires both, and refuses a code with spaces or symbols', () => {
    expect(examTypeCreateSchema.safeParse({ name: '', code: 'T1' }).success).toBe(false)
    expect(examTypeCreateSchema.safeParse({ name: 'First Term', code: '' }).success).toBe(false)
    expect(examTypeCreateSchema.safeParse({ name: 'First Term', code: 'T 1' }).success).toBe(false)
  })

  it('can be deactivated rather than deleted', () => {
    const parsed = examTypeCreateSchema.safeParse({
      name: 'Old Scheme',
      code: 'OLD',
      isActive: false,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.isActive).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('an exam paper', () => {
  const valid = {
    classId: UUID_A,
    subjectId: UUID_B,
    programId: UUID_C,
    examDate: '2026-05-10',
    startTime: '09:00',
    endTime: '12:00',
    maxMarks: '100',
    passingPercentage: '50',
  }

  it('accepts a complete paper', () => {
    expect(examPaperCreateSchema.safeParse(valid).success).toBe(true)
  })

  it('treats a blank programme as “every programme in the class”', () => {
    const parsed = examPaperCreateSchema.safeParse({ ...valid, programId: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.programId).toBeUndefined()
  })

  it('defaults the pass rule to 50%', () => {
    const { passingPercentage: _omitted, ...withoutPass } = valid
    const parsed = examPaperCreateSchema.safeParse(withoutPass)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.passingPercentage).toBe('50.00')
  })

  it('accepts a paper with no date or time yet', () => {
    expect(
      examPaperCreateSchema.safeParse({ ...valid, examDate: '', startTime: '', endTime: '' })
        .success,
    ).toBe(true)
  })

  it('refuses an end time without a start time', () => {
    const parsed = examPaperCreateSchema.safeParse({ ...valid, startTime: '', endTime: '12:00' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'startTime')).toBe(true)
    }
  })

  it('refuses a paper that ends before it starts', () => {
    const parsed = examPaperCreateSchema.safeParse({
      ...valid,
      startTime: '12:00',
      endTime: '09:00',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'endTime')).toBe(true)
    }
  })

  it('refuses a zero or negative maximum', () => {
    expect(examPaperCreateSchema.safeParse({ ...valid, maxMarks: '0' }).success).toBe(false)
    expect(examPaperCreateSchema.safeParse({ ...valid, maxMarks: '-10' }).success).toBe(false)
  })

  it('refuses a passing percentage above 100', () => {
    expect(
      examPaperCreateSchema.safeParse({ ...valid, passingPercentage: '120' }).success,
    ).toBe(false)
  })

  it('refuses ids the browser made up', () => {
    expect(examPaperCreateSchema.safeParse({ ...valid, classId: 'class-1' }).success).toBe(false)
    expect(examPaperCreateSchema.safeParse({ ...valid, subjectId: '' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('the exam list query', () => {
  it('defaults to the first page', () => {
    const parsed = examListQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
  })

  it('caps the page size so nobody can ask for the whole table', () => {
    expect(examListQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false)
    expect(examListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100)
  })

  it('accepts the real statuses and refuses invented ones', () => {
    expect(examListQuerySchema.parse({ status: 'SCHEDULED' }).status).toBe('SCHEDULED')
    expect(examListQuerySchema.safeParse({ status: 'PUBLISHED' }).success).toBe(false)
  })

  it('treats an empty filter as no filter', () => {
    const parsed = examListQuerySchema.parse({ status: '', examTypeId: '', academicSessionId: '' })
    expect(parsed.status).toBeUndefined()
    expect(parsed.examTypeId).toBeUndefined()
    expect(parsed.academicSessionId).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */

describe('who may manage exams', () => {
  it('gives an administrator both viewing and managing', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain('exams.view')
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain('exams.manage')
  })

  it('lets teachers and students see exams but never manage them', () => {
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toContain('exams.view')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain('exams.manage')
    }
  })

  it('adds no new permission for this stage', () => {
    // Reusing exams.view / exams.manage was the whole point; a screen-shaped
    // permission would have to be granted to somebody by hand.
    const examPermissions = ROLE_DEFAULT_PERMISSIONS.ADMIN.filter((p) => p.startsWith('exams.'))
    expect(examPermissions.sort()).toEqual(['exams.manage', 'exams.view'])
  })
})

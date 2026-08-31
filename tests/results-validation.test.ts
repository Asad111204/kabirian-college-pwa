import { describe, expect, it } from 'vitest'

import {
  generateResultsSchema,
  publishResultsSchema,
  RESULT_OUTCOMES,
  RESULT_STATUSES,
  resultListQuerySchema,
  teacherResultQuerySchema,
} from '../src/validation/results'
import { ROLE_DEFAULT_PERMISSIONS } from '../src/server/auth/permissions'
import { positionLabel } from '../src/features/results/shared'

/**
 * The result requests, and who may make them.
 *
 * The schemas settle whether a request is well formed; the service settles who
 * may make it. These check the first, plus the permission model the second
 * relies on.
 */

const UUID = '11111111-1111-4111-8111-111111111111'

describe('the enums the UI mirrors', () => {
  it('match the database exactly', () => {
    expect([...RESULT_OUTCOMES]).toEqual(['PASS', 'FAIL', 'INCOMPLETE'])
    expect([...RESULT_STATUSES]).toEqual(['DRAFT', 'PUBLISHED'])
  })
})

describe('the result list query', () => {
  it('defaults to the first page', () => {
    const parsed = resultListQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
  })

  it('caps the page size so nobody can ask for every student at once', () => {
    expect(resultListQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false)
    expect(resultListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100)
  })

  it('accepts the real outcomes and refuses invented ones', () => {
    expect(resultListQuerySchema.parse({ outcome: 'INCOMPLETE' }).outcome).toBe('INCOMPLETE')
    expect(resultListQuerySchema.safeParse({ outcome: 'ABSENT' }).success).toBe(false)
    expect(resultListQuerySchema.safeParse({ status: 'GENERATED' }).success).toBe(false)
  })

  it('treats an empty filter as no filter', () => {
    const parsed = resultListQuerySchema.parse({
      classId: '',
      programId: '',
      sectionId: '',
      outcome: '',
      status: '',
    })
    expect(parsed.classId).toBeUndefined()
    expect(parsed.sectionId).toBeUndefined()
    expect(parsed.outcome).toBeUndefined()
  })

  it('refuses an id that is not an identifier', () => {
    expect(resultListQuerySchema.safeParse({ classId: 'class-1' }).success).toBe(false)
    expect(resultListQuerySchema.safeParse({ sectionId: UUID }).success).toBe(true)
  })

  it('has no studentId filter at all', () => {
    // Whose result comes back is never a query parameter: the admin screen is
    // scoped by exam, and the future student screen will use ctx.studentId.
    const parsed = resultListQuerySchema.parse({ studentId: UUID })
    expect('studentId' in parsed).toBe(false)
  })
})

describe('generating', () => {
  it('does not regenerate unless asked', () => {
    const parsed = generateResultsSchema.parse({})
    expect(parsed.regenerate).toBe(false)
  })

  it('takes an explicit regenerate flag and a reason', () => {
    const parsed = generateResultsSchema.parse({
      regenerate: true,
      reason: 'Chemistry mark corrected',
    })
    expect(parsed.regenerate).toBe(true)
    expect(parsed.reason).toBe('Chemistry mark corrected')
  })

  it('drops an empty reason rather than storing a blank', () => {
    expect(generateResultsSchema.parse({ reason: '   ' }).reason).toBeUndefined()
  })

  it('refuses a reason longer than the column holds', () => {
    expect(generateResultsSchema.safeParse({ reason: 'x'.repeat(300) }).success).toBe(false)
  })
})

describe('publishing', () => {
  it('requires an explicit publish or withdraw', () => {
    expect(publishResultsSchema.safeParse({ publish: true }).success).toBe(true)
    expect(publishResultsSchema.safeParse({ publish: false }).success).toBe(true)
    expect(publishResultsSchema.safeParse({}).success).toBe(false)
    expect(publishResultsSchema.safeParse({ publish: 'yes' }).success).toBe(false)
  })
})

describe('who may generate and publish', () => {
  it('gives an administrator all three', () => {
    for (const permission of ['results.view', 'results.generate', 'results.publish'] as const) {
      expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain(permission)
    }
  })

  it('lets teachers and students read results but never make them', () => {
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toContain('results.view')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain('results.generate')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain('results.publish')
    }
  })

  it('adds no new permission for this stage', () => {
    const results = ROLE_DEFAULT_PERMISSIONS.ADMIN.filter((p) => p.startsWith('results.')).sort()
    expect(results).toEqual(['results.generate', 'results.publish', 'results.view'])
  })
})

describe('how a position reads', () => {
  it('uses the right ordinal', () => {
    expect(positionLabel(1)).toBe('1st')
    expect(positionLabel(2)).toBe('2nd')
    expect(positionLabel(3)).toBe('3rd')
    expect(positionLabel(4)).toBe('4th')
    expect(positionLabel(21)).toBe('21st')
    expect(positionLabel(22)).toBe('22nd')
    expect(positionLabel(23)).toBe('23rd')
  })

  it('gets the teens right', () => {
    expect(positionLabel(11)).toBe('11th')
    expect(positionLabel(12)).toBe('12th')
    expect(positionLabel(13)).toBe('13th')
    expect(positionLabel(111)).toBe('111th')
  })

  it('shows a dash for a result that is not ranked', () => {
    expect(positionLabel(null)).toBe('—')
  })
})

describe('a teacher’s filters', () => {
  it('default to the first page', () => {
    const parsed = teacherResultQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
  })

  it('cap the page size', () => {
    expect(teacherResultQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false)
  })

  it('accept the filters a teacher may narrow by', () => {
    const parsed = teacherResultQuerySchema.parse({
      examId: UUID,
      classId: UUID,
      programId: UUID,
      sectionId: UUID,
      subjectId: UUID,
      search: 'Ali',
    })
    expect(parsed.sectionId).toBe(UUID)
    expect(parsed.subjectId).toBe(UUID)
    expect(parsed.search).toBe('Ali')
  })

  it('treat an empty filter as no filter', () => {
    const parsed = teacherResultQuerySchema.parse({ examId: '', sectionId: '', subjectId: '' })
    expect(parsed.examId).toBeUndefined()
    expect(parsed.sectionId).toBeUndefined()
    expect(parsed.subjectId).toBeUndefined()
  })

  it('refuse an id that is not an identifier', () => {
    expect(teacherResultQuerySchema.safeParse({ sectionId: 'section-1' }).success).toBe(false)
  })

  it('have no staffId field at all', () => {
    // Whose scope this is comes from the session. A teacher cannot name
    // themselves, or anybody else, in the query.
    const parsed = teacherResultQuerySchema.parse({ staffId: UUID, studentId: UUID })
    expect('staffId' in parsed).toBe(false)
    expect('studentId' in parsed).toBe(false)
  })
})

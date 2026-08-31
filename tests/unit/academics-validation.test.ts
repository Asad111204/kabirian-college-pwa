import { describe, expect, it } from 'vitest'
import {
  academicSessionCreateSchema,
  classCreateSchema,
  divisionCreateSchema,
  programCreateSchema,
  sectionCreateSchema,
  subjectCreateSchema,
} from '@/validation/academics'

const UUID = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d8e9f'

describe('program validation', () => {
  it('accepts a new program the admin might add later', () => {
    const result = programCreateSchema.safeParse({
      name: 'I.Com',
      code: 'ICOM',
      description: 'Intermediate in Commerce',
      sortOrder: 6,
      isActive: true,
    })
    expect(result.success).toBe(true)
  })

  it('normalises the code to upper case so duplicates cannot slip through', () => {
    const result = programCreateSchema.parse({ name: 'I.Com', code: 'icom' })
    expect(result.code).toBe('ICOM')
  })

  it('rejects a code with spaces or symbols', () => {
    expect(programCreateSchema.safeParse({ name: 'Test', code: 'I COM' }).success).toBe(false)
    expect(programCreateSchema.safeParse({ name: 'Test', code: 'I.COM' }).success).toBe(false)
  })

  it('requires a name and a code', () => {
    expect(programCreateSchema.safeParse({ name: '', code: 'X' }).success).toBe(false)
    expect(programCreateSchema.safeParse({ name: 'X', code: '' }).success).toBe(false)
  })

  it('trims stray whitespace', () => {
    const result = programCreateSchema.parse({ name: '  Pre-Medical  ', code: ' pm ' })
    expect(result.name).toBe('Pre-Medical')
    expect(result.code).toBe('PM')
  })

  it('turns an empty description into undefined rather than an empty string', () => {
    const result = programCreateSchema.parse({ name: 'X', code: 'X', description: '' })
    expect(result.description).toBeUndefined()
  })

  it('defaults a new program to active', () => {
    expect(programCreateSchema.parse({ name: 'X', code: 'X' }).isActive).toBe(true)
  })
})

describe('class validation', () => {
  it('accepts the college’s real classes', () => {
    expect(
      classCreateSchema.safeParse({
        name: '1st Year',
        displayName: '1st Year / 11th Class',
        code: '11',
        level: 1,
      }).success,
    ).toBe(true)
  })

  it('requires a level of at least 1, because level drives promotion order', () => {
    expect(classCreateSchema.safeParse({ name: 'X', code: 'X', level: 0 }).success).toBe(false)
    expect(classCreateSchema.safeParse({ name: 'X', code: 'X', level: -1 }).success).toBe(false)
  })

  it('accepts a level sent as a string by an HTML form', () => {
    expect(classCreateSchema.parse({ name: 'X', code: 'X', level: '2' }).level).toBe(2)
  })
})

describe('division validation', () => {
  it('accepts Boys and Girls', () => {
    expect(divisionCreateSchema.safeParse({ name: 'Boys', code: 'B' }).success).toBe(true)
    expect(divisionCreateSchema.safeParse({ name: 'Girls', code: 'G' }).success).toBe(true)
  })

  it('accepts a future division the college might invent', () => {
    expect(divisionCreateSchema.safeParse({ name: 'Evening', code: 'EVE' }).success).toBe(true)
  })
})

describe('subject validation', () => {
  it('allows a subject without a code', () => {
    const result = subjectCreateSchema.parse({ name: 'Tarjuma-tul-Quran' })
    expect(result.code).toBeUndefined()
  })

  it('upper-cases a code when one is given', () => {
    expect(subjectCreateSchema.parse({ name: 'Biology', code: 'bio' }).code).toBe('BIO')
  })
})

describe('academic session validation', () => {
  it('accepts a well-formed session', () => {
    expect(
      academicSessionCreateSchema.safeParse({
        name: '2026-27',
        startDate: '2026-08-01',
        endDate: '2027-07-31',
        status: 'ACTIVE',
      }).success,
    ).toBe(true)
  })

  it('rejects a name that is not YYYY-YY', () => {
    for (const name of ['2026', '2026/27', '26-27', '2026-2027']) {
      expect(
        academicSessionCreateSchema.safeParse({
          name,
          startDate: '2026-08-01',
          endDate: '2027-07-31',
        }).success,
        `${name} should be rejected`,
      ).toBe(false)
    }
  })

  it('rejects an end date before the start date', () => {
    const result = academicSessionCreateSchema.safeParse({
      name: '2026-27',
      startDate: '2027-08-01',
      endDate: '2026-07-31',
    })
    expect(result.success).toBe(false)
  })
})

describe('section validation', () => {
  it('accepts a second section for the same program', () => {
    expect(sectionCreateSchema.safeParse({ academicGroupId: UUID, name: 'B' }).success).toBe(true)
  })

  it('rejects a section without a group', () => {
    expect(sectionCreateSchema.safeParse({ academicGroupId: 'not-a-uuid', name: 'B' }).success).toBe(
      false,
    )
  })
})

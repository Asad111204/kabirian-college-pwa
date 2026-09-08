import { describe, expect, it } from 'vitest'
import { homeworkCreateSchema, homeworkFeedQuerySchema, homeworkListQuerySchema, homeworkUpdateSchema } from '@/validation/homework'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('homework schemas', () => {
  it('creates with a section, a subject, a title, optional instructions and an optional date', () => {
    const parsed = homeworkCreateSchema.parse({ sectionId: UUID, subjectId: UUID, title: ' Exercise 3.2 ', instructions: '', dueDate: '' })
    expect(parsed.title).toBe('Exercise 3.2')
    expect(parsed.instructions).toBe('')
    expect(parsed.dueDate).toBeUndefined()
    expect(homeworkCreateSchema.parse({ sectionId: UUID, subjectId: UUID, title: 'x', dueDate: '2026-09-15' }).dueDate).toBe('2026-09-15')
  })

  it('refuses a missing title, a title that is too long, a bad date and an id that is not one', () => {
    expect(homeworkCreateSchema.safeParse({ sectionId: UUID, subjectId: UUID, title: '   ' }).success).toBe(false)
    expect(homeworkCreateSchema.safeParse({ sectionId: UUID, subjectId: UUID, title: 'x'.repeat(201) }).success).toBe(false)
    expect(homeworkCreateSchema.safeParse({ sectionId: UUID, subjectId: UUID, title: 'x', dueDate: '15/09/2026' }).success).toBe(false)
    expect(homeworkCreateSchema.safeParse({ sectionId: 'sec', subjectId: UUID, title: 'x' }).success).toBe(false)
  })

  it('updates only the words and the date, never the section or subject', () => {
    const parsed = homeworkUpdateSchema.parse({ title: 'New', instructions: 'Read chapter 4.', dueDate: null })
    expect(parsed).toEqual({ title: 'New', instructions: 'Read chapter 4.', dueDate: undefined })
    expect('sectionId' in homeworkUpdateSchema.shape).toBe(false)
  })

  it('lists with past homework hidden unless asked, and feeds the same way', () => {
    expect(homeworkListQuerySchema.parse({}).includePast).toBe(false)
    expect(homeworkListQuerySchema.parse({ includePast: 'true', sectionId: '' }).includePast).toBe(true)
    expect(homeworkListQuerySchema.parse({ sectionId: '' }).sectionId).toBeUndefined()
    expect(homeworkFeedQuerySchema.parse({ includePast: '1' }).includePast).toBe(true)
    expect(homeworkFeedQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false)
  })
})

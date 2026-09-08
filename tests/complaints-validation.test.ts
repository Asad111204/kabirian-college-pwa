import { describe, expect, it } from 'vitest'
import {
  complaintCreateSchema,
  complaintListQuerySchema,
  complaintReplySchema,
  complaintStatusChangeSchema,
  myComplaintsQuerySchema,
} from '@/validation/complaints'

/** Phase 23. What the complaints endpoints will and will not accept. */
const good = { category: 'FEES' as const, subject: 'Fee voucher shows last month twice', body: 'I paid the August voucher on the 3rd but September still shows it as due.' }

describe('writing an application', () => {
  it('accepts a category, a subject and a few sentences', () => {
    const parsed = complaintCreateSchema.parse(good)
    expect(parsed.category).toBe('FEES')
    expect(parsed.subject).toBe(good.subject)
  })

  it('trims, and refuses a subject that is only spaces', () => {
    expect(complaintCreateSchema.parse({ ...good, subject: '  Fees  ' }).subject).toBe('Fees')
    expect(complaintCreateSchema.safeParse({ ...good, subject: '   ' }).success).toBe(false)
  })

  it('refuses a category the college does not have', () => {
    expect(complaintCreateSchema.safeParse({ ...good, category: 'CANTEEN' }).success).toBe(false)
  })

  it('asks for more than a few words, so the office has something to act on', () => {
    const short = complaintCreateSchema.safeParse({ ...good, body: 'Fees wrong' })
    expect(short.success).toBe(false)
    if (!short.success) expect(short.error.issues[0]!.message).toMatch(/couple of sentences/)
  })

  it('refuses a subject or a body longer than the column', () => {
    expect(complaintCreateSchema.safeParse({ ...good, subject: 'x'.repeat(151) }).success).toBe(false)
    expect(complaintCreateSchema.safeParse({ ...good, body: 'x'.repeat(4001) }).success).toBe(false)
  })
})

describe('replying', () => {
  it('accepts a short reply but not an empty one', () => {
    expect(complaintReplySchema.parse({ body: 'Thank you.' }).body).toBe('Thank you.')
    expect(complaintReplySchema.safeParse({ body: ' ' }).success).toBe(false)
    expect(complaintReplySchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false)
  })
})

describe('the office changing the state', () => {
  it('takes a state and an optional closing message', () => {
    expect(complaintStatusChangeSchema.parse({ status: 'RESOLVED' }).note).toBeUndefined()
    expect(complaintStatusChangeSchema.parse({ status: 'RESOLVED', note: '  Sorted with the accounts office.  ' }).note).toBe('Sorted with the accounts office.')
    expect(complaintStatusChangeSchema.parse({ status: 'IN_REVIEW', note: '' }).note).toBeUndefined()
  })

  it('refuses a state that does not exist', () => {
    expect(complaintStatusChangeSchema.safeParse({ status: 'CLOSED' }).success).toBe(false)
  })
})

describe('the lists', () => {
  it('defaults to the first page with no filters', () => {
    const query = complaintListQuerySchema.parse({})
    expect(query.page).toBe(1)
    expect(query.status).toBeUndefined()
    expect(query.category).toBeUndefined()
    expect(query.awaitingOffice).toBe(false)
  })

  it('treats an empty box and "ALL" as no filter', () => {
    expect(complaintListQuerySchema.parse({ status: '' }).status).toBeUndefined()
    expect(complaintListQuerySchema.parse({ category: 'ALL' }).category).toBeUndefined()
  })

  it('refuses a state or a category it does not know, and a student id that is not one', () => {
    expect(complaintListQuerySchema.safeParse({ status: 'PENDING' }).success).toBe(false)
    expect(complaintListQuerySchema.safeParse({ category: 'CANTEEN' }).success).toBe(false)
    expect(complaintListQuerySchema.safeParse({ studentId: 'ali' }).success).toBe(false)
  })

  it('reads the waiting-on-us switch from a query string', () => {
    expect(complaintListQuerySchema.parse({ awaitingOffice: 'true' }).awaitingOffice).toBe(true)
    expect(complaintListQuerySchema.parse({ awaitingOffice: 'no' }).awaitingOffice).toBe(false)
  })

  it('folds closed applications away from the student’s own list by default', () => {
    expect(myComplaintsQuerySchema.parse({}).includeClosed).toBe(false)
    expect(myComplaintsQuerySchema.parse({ includeClosed: 'true' }).includeClosed).toBe(true)
  })
})

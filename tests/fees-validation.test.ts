import { describe, expect, it } from 'vitest'
import {
  admissionFeeSchema,
  feeLineSchema,
  feePaymentSchema,
  feePaymentVoidSchema,
  feeRulesSchema,
  studentFeePlanSchema,
  voucherCancelSchema,
  voucherListQuerySchema,
  voucherRunSchema,
} from '@/validation/fees'

/**
 * Phase 25. What the fee endpoints will and will not accept. Amounts arrive
 * as rupees from a form and leave this file as whole paisa.
 */

describe('a fee line', () => {
  it('turns typed rupees into paisa', () => {
    expect(feeLineSchema.parse({ head: 'TUITION', amountPaisa: '12500' }).amountPaisa).toBe(1_250_000)
    expect(feeLineSchema.parse({ head: 'TOUR', amountPaisa: '12,500.50' }).amountPaisa).toBe(1_250_050)
    expect(feeLineSchema.parse({ head: 'ANNUAL_FUNDS', amountPaisa: 1_250_000 }).amountPaisa).toBe(1_250_000)
  })

  it('keeps the office’s own words for an "Others" line', () => {
    expect(feeLineSchema.parse({ head: 'OTHER', label: ' Hostel ', amountPaisa: '500' }).label).toBe('Hostel')
  })

  it('refuses a head the college does not charge, and a line of nothing', () => {
    expect(feeLineSchema.safeParse({ head: 'CANTEEN', amountPaisa: '100' }).success).toBe(false)
    const zero = feeLineSchema.safeParse({ head: 'TUITION', amountPaisa: '0' })
    expect(zero.success).toBe(false)
    if (!zero.success) expect(zero.error.issues[0]!.message).toMatch(/greater than nought/)
  })

  it('refuses an amount with an extra zero, and says why', () => {
    const bad = feeLineSchema.safeParse({ head: 'TUITION', amountPaisa: '99999999' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues[0]!.message).toMatch(/extra zero/)
  })
})

describe('a student’s fee for the year', () => {
  const SESSION = '11111111-1111-4111-8111-111111111111'

  it('takes a set of heads and a concession', () => {
    const parsed = studentFeePlanSchema.parse({
      academicSessionId: SESSION,
      lines: [
        { head: 'TUITION', amountPaisa: '30000' },
        { head: 'ANNUAL_FUNDS', amountPaisa: '5000' },
      ],
      feeDiscountPaisa: '2500',
    })
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]!.amountPaisa).toBe(3_000_000)
    expect(parsed.feeDiscountPaisa).toBe(250_000)
  })

  it('accepts no heads at all: every one of them is optional', () => {
    const parsed = studentFeePlanSchema.parse({ academicSessionId: SESSION })
    expect(parsed.lines).toEqual([])
    expect(parsed.feeDiscountPaisa).toBe(0)
  })

  it('needs to know which year it is for', () => {
    expect(studentFeePlanSchema.safeParse({ lines: [] }).success).toBe(false)
    expect(studentFeePlanSchema.safeParse({ academicSessionId: 'this-year' }).success).toBe(false)
  })

  it('is the same shape on the admission form, without the year', () => {
    const parsed = admissionFeeSchema.parse({ lines: [{ head: 'TOUR', amountPaisa: '1500' }] })
    expect(parsed.lines[0]!.head).toBe('TOUR')
    expect(admissionFeeSchema.parse({}).lines).toEqual([])
  })
})

describe('issuing a year', () => {
  const SESSION = '11111111-1111-4111-8111-111111111111'

  it('takes a session, and checks first when asked', () => {
    const parsed = voucherRunSchema.parse({ academicSessionId: SESSION, dryRun: 'true' })
    expect(parsed.academicSessionId).toBe(SESSION)
    expect(parsed.dryRun).toBe(true)
    expect(voucherRunSchema.parse({ academicSessionId: SESSION }).dryRun).toBe(false)
  })

  it('leaves the due date out unless the college sets one', () => {
    expect(voucherRunSchema.parse({ academicSessionId: SESSION }).dueDate).toBeUndefined()
    expect(voucherRunSchema.parse({ academicSessionId: SESSION, dueDate: '' }).dueDate).toBeUndefined()
    expect(voucherRunSchema.parse({ academicSessionId: SESSION, dueDate: '2026-10-15' }).dueDate).toBe('2026-10-15')
    expect(voucherRunSchema.safeParse({ academicSessionId: SESSION, dueDate: 'October' }).success).toBe(false)
  })

  it('refuses a session that is not an identifier', () => {
    expect(voucherRunSchema.safeParse({ academicSessionId: '2026-27' }).success).toBe(false)
  })
})

describe('a payment', () => {
  const good = { amountPaisa: '5000', paidOn: '2026-09-09', method: 'CASH' as const }

  it('takes an amount, a date and how it arrived', () => {
    const parsed = feePaymentSchema.parse(good)
    expect(parsed.amountPaisa).toBe(500_000)
    expect(parsed.method).toBe('CASH')
  })

  it('refuses a payment of nothing, which the database refuses too', () => {
    const zero = feePaymentSchema.safeParse({ ...good, amountPaisa: '0' })
    expect(zero.success).toBe(false)
    if (!zero.success) expect(zero.error.issues[0]!.message).toMatch(/greater than nought/)
  })

  it('refuses a way of paying the college does not have', () => {
    expect(feePaymentSchema.safeParse({ ...good, method: 'BITCOIN' }).success).toBe(false)
  })

  it('refuses a date that is not a date, and a reference longer than the column', () => {
    expect(feePaymentSchema.safeParse({ ...good, paidOn: '09-09-2026' }).success).toBe(false)
    expect(feePaymentSchema.safeParse({ ...good, reference: 'x'.repeat(61) }).success).toBe(false)
  })

  it('asks for a reason before voiding one, or cancelling a voucher', () => {
    expect(feePaymentVoidSchema.safeParse({ reason: '  ' }).success).toBe(false)
    expect(voucherCancelSchema.safeParse({ reason: 'Issued twice by mistake' }).success).toBe(true)
    expect(voucherCancelSchema.safeParse({}).success).toBe(false)
  })
})

describe('the rules and the list', () => {
  it('takes a late fine in rupees', () => {
    expect(feeRulesSchema.parse({ lateFinePaisa: '500' })).toEqual({ lateFinePaisa: 50_000 })
    expect(feeRulesSchema.parse({ lateFinePaisa: 0 }).lateFinePaisa).toBe(0)
    expect(feeRulesSchema.safeParse({ lateFinePaisa: 'none' }).success).toBe(false)
  })

  it('defaults the list to the first page with no filters', () => {
    const query = voucherListQuerySchema.parse({})
    expect(query.page).toBe(1)
    expect(query.status).toBeUndefined()
    expect(query.owingOnly).toBe(false)
  })

  it('treats an empty box and "ALL" as no filter, and refuses a state it does not know', () => {
    expect(voucherListQuerySchema.parse({ status: '' }).status).toBeUndefined()
    expect(voucherListQuerySchema.parse({ status: 'ALL' }).status).toBeUndefined()
    expect(voucherListQuerySchema.safeParse({ status: 'WRITTEN_OFF' }).success).toBe(false)
  })
})

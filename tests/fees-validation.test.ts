import { describe, expect, it } from 'vitest'
import {
  feePackageCreateSchema,
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
const PACKAGE = '77777777-7777-4777-8777-777777777771'

describe('a fee package', () => {
  it('turns typed rupees into paisa', () => {
    expect(feePackageCreateSchema.parse({ name: 'Regular', monthlyAmountPaisa: '12500' }).monthlyAmountPaisa).toBe(1_250_000)
    expect(feePackageCreateSchema.parse({ name: 'Regular', monthlyAmountPaisa: '12,500.50' }).monthlyAmountPaisa).toBe(1_250_050)
    expect(feePackageCreateSchema.parse({ name: 'Regular', monthlyAmountPaisa: 1_250_000 }).monthlyAmountPaisa).toBe(1_250_000)
  })

  it('is in use unless the office says otherwise', () => {
    expect(feePackageCreateSchema.parse({ name: 'Regular', monthlyAmountPaisa: '1' }).isActive).toBe(true)
    expect(feePackageCreateSchema.parse({ name: 'Regular', monthlyAmountPaisa: '1', isActive: false }).isActive).toBe(false)
  })

  it('refuses a name that is only spaces, a negative amount, and words', () => {
    expect(feePackageCreateSchema.safeParse({ name: '  ', monthlyAmountPaisa: '1' }).success).toBe(false)
    expect(feePackageCreateSchema.safeParse({ name: 'Regular', monthlyAmountPaisa: '-500' }).success).toBe(false)
    expect(feePackageCreateSchema.safeParse({ name: 'Regular', monthlyAmountPaisa: 'twelve thousand' }).success).toBe(false)
  })

  it('refuses an amount with an extra zero, and says why', () => {
    const bad = feePackageCreateSchema.safeParse({ name: 'Regular', monthlyAmountPaisa: '99999999' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues[0]!.message).toMatch(/extra zero/)
  })
})

describe('a student’s plan', () => {
  it('takes a package and a concession, and no package at all', () => {
    expect(studentFeePlanSchema.parse({ feePackageId: PACKAGE, feeDiscountPaisa: '500' })).toEqual({ feePackageId: PACKAGE, feeDiscountPaisa: 50_000 })
    expect(studentFeePlanSchema.parse({ feePackageId: '' }).feePackageId).toBeUndefined()
    expect(studentFeePlanSchema.parse({}).feeDiscountPaisa).toBe(0)
  })

  it('refuses a package that is not an identifier', () => {
    expect(studentFeePlanSchema.safeParse({ feePackageId: 'regular' }).success).toBe(false)
  })
})

describe('issuing a month', () => {
  it('takes a month, and checks first when asked', () => {
    const parsed = voucherRunSchema.parse({ month: '2026-09-01', dryRun: 'true' })
    expect(parsed.month).toBe('2026-09-01')
    expect(parsed.dryRun).toBe(true)
    expect(voucherRunSchema.parse({ month: '2026-09-01' }).dryRun).toBe(false)
  })

  it('takes a due day only within a month', () => {
    expect(voucherRunSchema.parse({ month: '2026-09-01', dueDay: '15' }).dueDay).toBe(15)
    expect(voucherRunSchema.safeParse({ month: '2026-09-01', dueDay: '0' }).success).toBe(false)
    expect(voucherRunSchema.safeParse({ month: '2026-09-01', dueDay: '32' }).success).toBe(false)
  })

  it('refuses a month that is not a date', () => {
    expect(voucherRunSchema.safeParse({ month: 'September' }).success).toBe(false)
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
  it('takes a due day and a fine in rupees', () => {
    expect(feeRulesSchema.parse({ dueDayOfMonth: '10', lateFinePaisa: '500' })).toEqual({ dueDayOfMonth: 10, lateFinePaisa: 50_000 })
    expect(feeRulesSchema.parse({ dueDayOfMonth: 1, lateFinePaisa: 0 }).lateFinePaisa).toBe(0)
    expect(feeRulesSchema.safeParse({ dueDayOfMonth: 32, lateFinePaisa: 0 }).success).toBe(false)
  })

  it('defaults the list to the first page with no filters', () => {
    const query = voucherListQuerySchema.parse({})
    expect(query.page).toBe(1)
    expect(query.status).toBeUndefined()
    expect(query.overdueOnly).toBe(false)
  })

  it('treats an empty box and "ALL" as no filter, and refuses a state it does not know', () => {
    expect(voucherListQuerySchema.parse({ status: '' }).status).toBeUndefined()
    expect(voucherListQuerySchema.parse({ status: 'ALL' }).status).toBeUndefined()
    expect(voucherListQuerySchema.safeParse({ status: 'WRITTEN_OFF' }).success).toBe(false)
  })
})

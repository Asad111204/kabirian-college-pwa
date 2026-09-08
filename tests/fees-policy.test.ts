import { describe, expect, it } from 'vitest'
import {
  FEE_VOUCHER_STATUSES,
  FEE_VOUCHER_STATUS_LABEL,
  decideCanCancelVoucher,
  decideCanRecordPayment,
  decideCanVoidPayment,
  discountFor,
  dueDateFor,
  isOverdue,
  lateFineDue,
  monthLabel,
  monthStart,
  netPayable,
  outstanding,
  overpaid,
  shouldBillForMonth,
  statusFor,
} from '@/server/fees/fees-policy'

/**
 * Phase 25. The arithmetic of one voucher, and the rules about when a fine
 * applies and what may still be done. Everything is whole paisa.
 */
const RS = (rupees: number) => rupees * 100

describe('the month and its due date', () => {
  it('takes the first day of the month a date falls in', () => {
    expect(monthStart('2026-09-17')).toBe('2026-09-01')
    expect(monthStart('2026-09-01')).toBe('2026-09-01')
    expect(monthLabel('2026-09-01')).toBe('September 2026')
  })

  it('puts the due date on the day the office chose', () => {
    expect(dueDateFor('2026-09-01', 10)).toBe('2026-09-10')
    expect(dueDateFor('2026-09-01', 1)).toBe('2026-09-01')
  })

  it('never spills into the next month when the day does not exist', () => {
    // The 31st of February is the 28th, and the 29th in a leap year.
    expect(dueDateFor('2026-02-01', 31)).toBe('2026-02-28')
    expect(dueDateFor('2028-02-01', 31)).toBe('2028-02-29')
    expect(dueDateFor('2026-04-01', 31)).toBe('2026-04-30')
  })

  it('clamps a nonsense day rather than producing a nonsense date', () => {
    expect(dueDateFor('2026-09-01', 0)).toBe('2026-09-01')
    expect(dueDateFor('2026-09-01', 99)).toBe('2026-09-30')
  })
})

describe('what a voucher comes to', () => {
  it('is the fee, less the concession, plus any fine', () => {
    expect(netPayable({ grossPaisa: RS(12500), discountPaisa: RS(2500), lateFinePaisa: RS(500) })).toBe(RS(10500))
    expect(netPayable({ grossPaisa: RS(12500), discountPaisa: 0, lateFinePaisa: 0 })).toBe(RS(12500))
  })

  it('caps a concession at the fee, so the college never owes a family money', () => {
    expect(discountFor(RS(12500), RS(2500))).toBe(RS(2500))
    expect(discountFor(RS(2000), RS(2500))).toBe(RS(2000))
    expect(discountFor(RS(12500), 0)).toBe(0)
    expect(discountFor(RS(12500), -500)).toBe(0)
  })

  it('counts what is still to come in, and never a negative', () => {
    const amounts = { grossPaisa: RS(12500), discountPaisa: RS(2500), lateFinePaisa: 0, paidPaisa: RS(4000) }
    expect(outstanding(amounts)).toBe(RS(6000))
    expect(outstanding({ ...amounts, paidPaisa: RS(99999) })).toBe(0)
    expect(overpaid({ ...amounts, paidPaisa: RS(11000) })).toBe(RS(1000))
    expect(overpaid(amounts)).toBe(0)
  })

  it('reads the state off the arithmetic, except when the office has cancelled it', () => {
    const base = { grossPaisa: RS(10000), discountPaisa: 0, lateFinePaisa: 0 }
    expect(statusFor({ ...base, paidPaisa: 0 }, false)).toBe('UNPAID')
    expect(statusFor({ ...base, paidPaisa: RS(4000) }, false)).toBe('PARTIALLY_PAID')
    expect(statusFor({ ...base, paidPaisa: RS(10000) }, false)).toBe('PAID')
    expect(statusFor({ ...base, paidPaisa: RS(12000) }, false)).toBe('PAID')
    expect(statusFor({ ...base, paidPaisa: RS(4000) }, true)).toBe('CANCELLED')
  })

  it('counts a fine as part of what settles it', () => {
    // 10,000 fee with a 500 fine is not settled by 10,000.
    const withFine = { grossPaisa: RS(10000), discountPaisa: 0, lateFinePaisa: RS(500) }
    expect(statusFor({ ...withFine, paidPaisa: RS(10000) }, false)).toBe('PARTIALLY_PAID')
    expect(statusFor({ ...withFine, paidPaisa: RS(10500) }, false)).toBe('PAID')
  })
})

describe('the late fine', () => {
  const voucher = { dueDate: '2026-09-10', grossPaisa: RS(10000), discountPaisa: 0, paidPaisa: 0, cancelled: false }

  it('is nothing on or before the due date', () => {
    expect(lateFineDue(voucher, '2026-09-01', RS(500))).toBe(0)
    expect(lateFineDue(voucher, '2026-09-10', RS(500))).toBe(0)
  })

  it('is the flat amount once the day has passed, and does not grow', () => {
    expect(lateFineDue(voucher, '2026-09-11', RS(500))).toBe(RS(500))
    expect(lateFineDue(voucher, '2026-12-31', RS(500))).toBe(RS(500))
  })

  it('is nothing when the college charges none', () => {
    expect(lateFineDue(voucher, '2026-09-30', 0)).toBe(0)
  })

  it('is nothing on a voucher already settled, or cancelled', () => {
    expect(lateFineDue({ ...voucher, paidPaisa: RS(10000) }, '2026-09-30', RS(500))).toBe(0)
    expect(lateFineDue({ ...voucher, cancelled: true }, '2026-09-30', RS(500))).toBe(0)
  })

  it('still applies when only part of it was paid before the day', () => {
    expect(lateFineDue({ ...voucher, paidPaisa: RS(4000) }, '2026-09-30', RS(500))).toBe(RS(500))
  })

  it('takes the concession into account before deciding anything is owed', () => {
    // A full concession leaves nothing owing, so nothing to be fined for.
    expect(lateFineDue({ ...voucher, discountPaisa: RS(10000) }, '2026-09-30', RS(500))).toBe(0)
  })

  it('calls a voucher overdue only while something is still owed', () => {
    expect(isOverdue({ dueDate: '2026-09-10', status: 'UNPAID' }, '2026-09-11')).toBe(true)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'PARTIALLY_PAID' }, '2026-09-11')).toBe(true)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'UNPAID' }, '2026-09-10')).toBe(false)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'PAID' }, '2026-09-30')).toBe(false)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'CANCELLED' }, '2026-09-30')).toBe(false)
  })
})

describe('who is billed for a month', () => {
  const on = { admissionDate: '2026-04-01', hasPackage: true }

  it('bills a student on a package who was here', () => {
    expect(shouldBillForMonth(on, '2026-09-01')).toBe(true)
    // Admitted part-way through the month: that month is still billed.
    expect(shouldBillForMonth({ ...on, admissionDate: '2026-09-20' }, '2026-09-01')).toBe(true)
  })

  it('does not bill somebody with no package', () => {
    expect(shouldBillForMonth({ ...on, hasPackage: false }, '2026-09-01')).toBe(false)
  })

  it('does not bill a month before they arrived, or after they left', () => {
    expect(shouldBillForMonth({ ...on, admissionDate: '2026-10-01' }, '2026-09-01')).toBe(false)
    expect(shouldBillForMonth({ ...on, leavingDate: '2026-08-31' }, '2026-09-01')).toBe(false)
    // Left during the month: that month is still theirs.
    expect(shouldBillForMonth({ ...on, leavingDate: '2026-09-15' }, '2026-09-01')).toBe(true)
  })
})

describe('what may still be done', () => {
  it('cancels a voucher nobody has paid against', () => {
    expect(decideCanCancelVoucher({ status: 'UNPAID', paidPaisa: 0 }).allowed).toBe(true)
  })

  it('refuses to cancel one that has money on it, and says what to do first', () => {
    const decision = decideCanCancelVoucher({ status: 'PARTIALLY_PAID', paidPaisa: 100 })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toMatch(/Void the payments first/)
    expect(decideCanCancelVoucher({ status: 'CANCELLED', paidPaisa: 0 }).allowed).toBe(false)
  })

  it('takes money against an open voucher and nothing else', () => {
    expect(decideCanRecordPayment({ status: 'UNPAID' }).allowed).toBe(true)
    expect(decideCanRecordPayment({ status: 'PARTIALLY_PAID' }).allowed).toBe(true)
    const paid = decideCanRecordPayment({ status: 'PAID' })
    expect(paid.allowed).toBe(false)
    if (!paid.allowed) expect(paid.reason).toMatch(/settled in full/)
    const cancelled = decideCanRecordPayment({ status: 'CANCELLED' })
    expect(cancelled.allowed).toBe(false)
    if (!cancelled.allowed) expect(cancelled.reason).toMatch(/cancelled/)
  })

  it('voids a payment once, and not twice', () => {
    expect(decideCanVoidPayment({ voidedAt: null }).allowed).toBe(true)
    expect(decideCanVoidPayment({ voidedAt: new Date() }).allowed).toBe(false)
  })
})

describe('the small print', () => {
  it('names every state in words', () => {
    for (const status of FEE_VOUCHER_STATUSES) expect(FEE_VOUCHER_STATUS_LABEL[status]).toBeTruthy()
  })
})

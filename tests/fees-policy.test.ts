import { describe, expect, it } from 'vitest'
import {
  FEE_HEADS,
  FEE_HEAD_LABEL,
  FEE_VOUCHER_STATUSES,
  FEE_VOUCHER_STATUS_LABEL,
  decideCanCancelVoucher,
  decideCanRecordPayment,
  decideCanVoidPayment,
  discountFor,
  feeLineLabel,
  isOverdue,
  lateFineDue,
  netPayable,
  outstanding,
  overpaid,
  paidShare,
  shouldBillForSession,
  statusFor,
  totalOfLines,
} from '@/server/fees/fees-policy'

/**
 * Phase 28. The college charges an annual fee made up of named heads, and a
 * family pays it in instalments whenever they can. Everything is whole paisa.
 */
const RS = (rupees: number) => rupees * 100

describe('what a year is charged for', () => {
  it('names every head in words', () => {
    for (const head of FEE_HEADS) expect(FEE_HEAD_LABEL[head]).toBeTruthy()
    expect(FEE_HEAD_LABEL.TUITION).toBe('School tuition fee')
    expect(FEE_HEAD_LABEL.BOARD_REGISTRATION).toBe('Board registration fee')
  })

  it('uses the office’s own words for an "Others" line, and the head otherwise', () => {
    expect(feeLineLabel({ head: 'OTHER', label: 'Hostel' })).toBe('Hostel')
    expect(feeLineLabel({ head: 'OTHER', label: '  ' })).toBe('Others')
    expect(feeLineLabel({ head: 'OTHER', label: null })).toBe('Others')
    // A label on a named head is ignored: the head is what it is.
    expect(feeLineLabel({ head: 'TOUR', label: 'Anything' })).toBe('Tour fee')
  })

  it('adds the heads up, and comes to nothing when there are none', () => {
    expect(totalOfLines([{ amountPaisa: RS(12500) }, { amountPaisa: RS(5000) }])).toBe(RS(17500))
    expect(totalOfLines([])).toBe(0)
    // A negative amount cannot reduce the total; the database refuses one anyway.
    expect(totalOfLines([{ amountPaisa: RS(1000) }, { amountPaisa: -500 }])).toBe(RS(1000))
  })
})

describe('what a voucher comes to', () => {
  it('is the year’s fee, less the concession, plus any fine', () => {
    expect(netPayable({ grossPaisa: RS(30000), discountPaisa: RS(5000), lateFinePaisa: RS(500) })).toBe(RS(25500))
    expect(netPayable({ grossPaisa: RS(30000), discountPaisa: 0, lateFinePaisa: 0 })).toBe(RS(30000))
  })

  it('caps a concession at the fee, so the college never owes a family money', () => {
    expect(discountFor(RS(30000), RS(5000))).toBe(RS(5000))
    expect(discountFor(RS(2000), RS(5000))).toBe(RS(2000))
    expect(discountFor(RS(30000), 0)).toBe(0)
    expect(discountFor(RS(30000), -500)).toBe(0)
  })

  it('counts what is still to come in, and never a negative', () => {
    const amounts = { grossPaisa: RS(30000), discountPaisa: RS(5000), lateFinePaisa: 0, paidPaisa: RS(10000) }
    expect(outstanding(amounts)).toBe(RS(15000))
    expect(outstanding({ ...amounts, paidPaisa: RS(99999) })).toBe(0)
    expect(overpaid({ ...amounts, paidPaisa: RS(26000) })).toBe(RS(1000))
    expect(overpaid(amounts)).toBe(0)
  })

  it('says how far through the year’s fee a family is', () => {
    const base = { grossPaisa: RS(20000), discountPaisa: 0, lateFinePaisa: 0 }
    expect(paidShare({ ...base, paidPaisa: 0 })).toBe(0)
    expect(paidShare({ ...base, paidPaisa: RS(5000) })).toBe(25)
    expect(paidShare({ ...base, paidPaisa: RS(20000) })).toBe(100)
    // Never over a hundred, however much arrives.
    expect(paidShare({ ...base, paidPaisa: RS(90000) })).toBe(100)
    // Nothing to pay is nothing owing.
    expect(paidShare({ grossPaisa: 0, discountPaisa: 0, lateFinePaisa: 0, paidPaisa: 0 })).toBe(100)
  })

  it('reads the state off the arithmetic, except when the office has cancelled it', () => {
    const base = { grossPaisa: RS(20000), discountPaisa: 0, lateFinePaisa: 0 }
    expect(statusFor({ ...base, paidPaisa: 0 }, false)).toBe('UNPAID')
    // An instalment leaves it part paid, which is the ordinary state here.
    expect(statusFor({ ...base, paidPaisa: RS(4000) }, false)).toBe('PARTIALLY_PAID')
    expect(statusFor({ ...base, paidPaisa: RS(20000) }, false)).toBe('PAID')
    expect(statusFor({ ...base, paidPaisa: RS(25000) }, false)).toBe('PAID')
    expect(statusFor({ ...base, paidPaisa: RS(4000) }, true)).toBe('CANCELLED')
  })
})

describe('the late fine', () => {
  const withDate = { dueDate: '2026-09-10', grossPaisa: RS(20000), discountPaisa: 0, paidPaisa: 0, cancelled: false }

  it('is nothing at all when the college set no due date', () => {
    // The ordinary case here: families pay in instalments as they can.
    expect(lateFineDue({ ...withDate, dueDate: null }, '2027-01-01', RS(500))).toBe(0)
  })

  it('is nothing on or before a due date the college did set', () => {
    expect(lateFineDue(withDate, '2026-09-01', RS(500))).toBe(0)
    expect(lateFineDue(withDate, '2026-09-10', RS(500))).toBe(0)
  })

  it('is the flat amount once that day has passed, and does not grow', () => {
    expect(lateFineDue(withDate, '2026-09-11', RS(500))).toBe(RS(500))
    expect(lateFineDue(withDate, '2026-12-31', RS(500))).toBe(RS(500))
  })

  it('is nothing when the college charges none, or the fee is settled, or it is cancelled', () => {
    expect(lateFineDue(withDate, '2026-09-30', 0)).toBe(0)
    expect(lateFineDue({ ...withDate, paidPaisa: RS(20000) }, '2026-09-30', RS(500))).toBe(0)
    expect(lateFineDue({ ...withDate, cancelled: true }, '2026-09-30', RS(500))).toBe(0)
  })

  it('still applies when only part of it was paid before the day', () => {
    expect(lateFineDue({ ...withDate, paidPaisa: RS(4000) }, '2026-09-30', RS(500))).toBe(RS(500))
  })

  it('never calls a voucher with no due date overdue', () => {
    expect(isOverdue({ dueDate: null, status: 'UNPAID' }, '2027-01-01')).toBe(false)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'UNPAID' }, '2026-09-11')).toBe(true)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'PARTIALLY_PAID' }, '2026-09-11')).toBe(true)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'PAID' }, '2026-09-30')).toBe(false)
    expect(isOverdue({ dueDate: '2026-09-10', status: 'CANCELLED' }, '2026-09-30')).toBe(false)
  })
})

describe('who is billed for a year', () => {
  it('bills a student who has a fee set and no voucher yet', () => {
    expect(shouldBillForSession({ hasFeeLines: true, alreadyBilled: false })).toBe(true)
  })

  it('bills nobody twice, and nobody whose fee has not been set', () => {
    expect(shouldBillForSession({ hasFeeLines: true, alreadyBilled: true })).toBe(false)
    expect(shouldBillForSession({ hasFeeLines: false, alreadyBilled: false })).toBe(false)
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

  it('takes an instalment against an open voucher and nothing else', () => {
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

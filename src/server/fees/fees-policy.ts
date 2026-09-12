/**
 * Fees: what a year's bill comes to, and what may still be done to it.
 *
 * Pure functions with no database, in the shape of the other policy modules.
 * Everything here is in whole paisa; nothing in the fee system ever holds a
 * floating-point number of rupees.
 *
 * The college's rules, as it has now stated them (Phase 28):
 *   - the fee is **annual**, not monthly,
 *   - it is made up of named heads — tuition, annual funds, a tour and so on
 *     — and every one of them is optional,
 *   - a family pays it in **instalments, whenever they can**, so a due date
 *     is something the college may set rather than something every bill has,
 *   - a student's own concession comes off the year's total,
 *   - a flat late fine applies only if the college has set both a due date
 *     and a fine, and something is still owed after that day.
 */

/* -------------------------------------------------------------------------- */
/* What a fee is for                                                          */
/* -------------------------------------------------------------------------- */

export const FEE_HEADS = ['TUITION', 'ANNUAL_FUNDS', 'EVENTS_FUNDS', 'BOARD_REGISTRATION', 'BOARD_ADMISSION', 'TOUR', 'OTHER'] as const
export type FeeHeadValue = (typeof FEE_HEADS)[number]

export const FEE_HEAD_LABEL: Record<FeeHeadValue, string> = {
  TUITION: 'College tuition fee',
  ANNUAL_FUNDS: 'Annual funds',
  EVENTS_FUNDS: 'Events funds',
  BOARD_REGISTRATION: 'Board registration fee',
  BOARD_ADMISSION: 'Board admission fee',
  TOUR: 'Tour fee',
  OTHER: 'Others',
}

/** What a line is called on a screen: the office's own words for an "Others". */
export function feeLineLabel(line: { head: FeeHeadValue; label?: string | null }): string {
  if (line.head === 'OTHER' && line.label && line.label.trim() !== '') return line.label.trim()
  return FEE_HEAD_LABEL[line.head]
}

/** The year's fee before any concession: every head added up. */
export function totalOfLines(lines: readonly { amountPaisa: number }[]): number {
  return lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(line.amountPaisa)), 0)
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export const FEE_VOUCHER_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const
export type FeeVoucherStatusValue = (typeof FEE_VOUCHER_STATUSES)[number]

export const FEE_VOUCHER_STATUS_LABEL: Record<FeeVoucherStatusValue, string> = {
  UNPAID: 'Nothing paid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid in full',
  CANCELLED: 'Cancelled',
}

export const FEE_VOUCHER_STATUS_TONE: Record<FeeVoucherStatusValue, 'danger' | 'warning' | 'success' | 'neutral'> = {
  UNPAID: 'danger',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'neutral',
}

export const FEE_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER'] as const
export type FeePaymentMethodValue = (typeof FEE_PAYMENT_METHODS)[number]

export const FEE_PAYMENT_METHOD_LABEL: Record<FeePaymentMethodValue, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  ONLINE: 'Online',
  OTHER: 'Other',
}

/** No late fine, and no due date, until the college sets them. */
export const DEFAULT_LATE_FINE_PAISA = 0

/* -------------------------------------------------------------------------- */
/* What a voucher comes to                                                    */
/* -------------------------------------------------------------------------- */

export interface VoucherAmounts {
  grossPaisa: number
  discountPaisa: number
  lateFinePaisa: number
  paidPaisa: number
}

/**
 * The concession actually applied.
 *
 * A student's concession may be larger than the fee they end up with — the
 * office lowers a head, or removes one, and forgets the concession. It is
 * capped at the fee rather than allowed to turn the bill negative: the
 * college does not owe a family money for attending.
 */
export function discountFor(grossPaisa: number, studentDiscountPaisa: number): number {
  if (!Number.isFinite(studentDiscountPaisa) || studentDiscountPaisa <= 0) return 0
  return Math.min(Math.trunc(studentDiscountPaisa), Math.max(0, Math.trunc(grossPaisa)))
}

/** What is owed in total: the year's fee, less the concession, plus any fine. */
export function netPayable(amounts: Pick<VoucherAmounts, 'grossPaisa' | 'discountPaisa' | 'lateFinePaisa'>): number {
  return Math.max(0, amounts.grossPaisa - amounts.discountPaisa + amounts.lateFinePaisa)
}

/** What is still to come in. Never negative: an overpayment is not a debt to the family. */
export function outstanding(amounts: VoucherAmounts): number {
  return Math.max(0, netPayable(amounts) - amounts.paidPaisa)
}

/** More was received than was asked for, by this much. */
export function overpaid(amounts: VoucherAmounts): number {
  return Math.max(0, amounts.paidPaisa - netPayable(amounts))
}

/**
 * Where a voucher stands once money has moved.
 *
 * A cancelled voucher stays cancelled whatever arrives against it; that is
 * decided by the office, not by arithmetic.
 */
export function statusFor(amounts: VoucherAmounts, cancelled: boolean): FeeVoucherStatusValue {
  if (cancelled) return 'CANCELLED'
  if (amounts.paidPaisa <= 0) return 'UNPAID'
  return amounts.paidPaisa >= netPayable(amounts) ? 'PAID' : 'PARTIALLY_PAID'
}

/** How much of the year's fee has come in, as a whole percentage. */
export function paidShare(amounts: VoucherAmounts): number {
  const payable = netPayable(amounts)
  if (payable <= 0) return 100
  return Math.min(100, Math.round((amounts.paidPaisa / payable) * 100))
}

/**
 * The late fine owed on a voucher **today**.
 *
 * Only when the college has set both a due date and a fine. Families here pay
 * in instalments as they can, so most vouchers carry no date and no fine ever
 * applies; where the college does set one, it is flat, charged once the day
 * has passed and something is still owed. It is worked out rather than
 * stored, so nothing drifts when nobody opens the app for a week.
 */
export function lateFineDue(
  voucher: { dueDate: string | null; grossPaisa: number; discountPaisa: number; paidPaisa: number; cancelled: boolean },
  today: string,
  lateFinePaisa: number,
): number {
  if (voucher.cancelled) return 0
  if (!voucher.dueDate) return 0
  if (!Number.isFinite(lateFinePaisa) || lateFinePaisa <= 0) return 0
  if (today <= voucher.dueDate) return 0
  const owedBeforeFine = Math.max(0, voucher.grossPaisa - voucher.discountPaisa) - voucher.paidPaisa
  return owedBeforeFine > 0 ? Math.trunc(lateFinePaisa) : 0
}

/** Past its due date with something still owed. Never, when there is no date. */
export function isOverdue(voucher: { dueDate: string | null; status: FeeVoucherStatusValue }, today: string): boolean {
  if (!voucher.dueDate) return false
  if (voucher.status === 'PAID' || voucher.status === 'CANCELLED') return false
  return today > voucher.dueDate
}

/* -------------------------------------------------------------------------- */
/* What may still be done                                                     */
/* -------------------------------------------------------------------------- */

export type FeeDecision = { allowed: true } | { allowed: false; reason: string }

/**
 * May this voucher be cancelled?
 *
 * Not once money has been received against it. Withdrawing a bill somebody has
 * paid would leave the payment pointing at nothing; the office voids the
 * payment first, deliberately, and then cancels.
 */
export function decideCanCancelVoucher(voucher: { status: FeeVoucherStatusValue; paidPaisa: number }): FeeDecision {
  if (voucher.status === 'CANCELLED') return { allowed: false, reason: 'This voucher has already been cancelled.' }
  if (voucher.paidPaisa > 0) {
    return { allowed: false, reason: 'Money has been received against this voucher. Void the payments first, then cancel it.' }
  }
  return { allowed: true }
}

/** May money be recorded against this voucher? */
export function decideCanRecordPayment(voucher: { status: FeeVoucherStatusValue }): FeeDecision {
  if (voucher.status === 'CANCELLED') return { allowed: false, reason: 'This voucher was cancelled, so nothing can be recorded against it.' }
  if (voucher.status === 'PAID') return { allowed: false, reason: 'This voucher is already settled in full.' }
  return { allowed: true }
}

/** May this payment be voided? */
export function decideCanVoidPayment(payment: { voidedAt: Date | string | null }): FeeDecision {
  if (payment.voidedAt !== null) return { allowed: false, reason: 'This payment has already been voided.' }
  return { allowed: true }
}

/**
 * Whether a student should be billed for a session at all.
 *
 * Somebody with no fee lines for that year is not billed: the office has not
 * said what they owe, and a voucher for nothing helps nobody.
 */
export function shouldBillForSession(student: { hasFeeLines: boolean; alreadyBilled: boolean }): boolean {
  return student.hasFeeLines && !student.alreadyBilled
}

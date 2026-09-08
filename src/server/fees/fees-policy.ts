/**
 * Fees: what a voucher comes to, when a fine applies, and what may still be
 * done to it.
 *
 * Pure functions with no database, in the shape of the other policy modules.
 * Everything here is in whole paisa; nothing in the fee system ever holds a
 * floating-point number of rupees.
 *
 * The college's rules, confirmed for this phase:
 *   - a named package carries a monthly amount,
 *   - each student is on one package, with their own concession on top,
 *   - billing is monthly: one voucher per student per month, with a due date,
 *   - a flat late fine, set by the office, applies once the due date has
 *     passed and the voucher is not settled.
 */

export const FEE_VOUCHER_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const
export type FeeVoucherStatusValue = (typeof FEE_VOUCHER_STATUSES)[number]

export const FEE_VOUCHER_STATUS_LABEL: Record<FeeVoucherStatusValue, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
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

/** The day of the month a voucher falls due, when the office has not said. */
export const DEFAULT_DUE_DAY = 10
/** No late fine until the college sets one. */
export const DEFAULT_LATE_FINE_PAISA = 0

/* -------------------------------------------------------------------------- */
/* The month, and the day it falls due                                        */
/* -------------------------------------------------------------------------- */

/** The first day of the month a college date falls in: "2026-09-17" → "2026-09-01". */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** How many days a month has, from its first day. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}

/** "September 2026", for a heading. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, 1)))
}

/**
 * When a month's voucher falls due.
 *
 * A due day the month does not have becomes its last day rather than spilling
 * into the next one: the 31st in February is the 28th, or the 29th in a leap
 * year, and never the 3rd of March.
 */
export function dueDateFor(month: string, dueDay: number): string {
  const last = daysInMonth(month)
  const day = Math.min(Math.max(Math.trunc(dueDay), 1), last)
  return `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`
}

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
 * A student's concession may be larger than the package they end up on — the
 * office lowers a package, or moves somebody to a cheaper one, and forgets the
 * discount. It is capped at the fee rather than allowed to turn the bill
 * negative: the college does not owe a family money for attending.
 */
export function discountFor(grossPaisa: number, studentDiscountPaisa: number): number {
  if (!Number.isFinite(studentDiscountPaisa) || studentDiscountPaisa <= 0) return 0
  return Math.min(Math.trunc(studentDiscountPaisa), Math.max(0, Math.trunc(grossPaisa)))
}

/** What is owed on a voucher in total: the fee, less the concession, plus any fine. */
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

/**
 * The late fine owed on a voucher **today**.
 *
 * Flat, not per day: the college asked for "a fine applied after the due
 * date", and a fine that grows every night is a different promise. It is
 * charged once the due date has passed and something is still owed, so a
 * family who paid in full on the last day is never fined, and a voucher
 * already settled cannot grow a fine later.
 *
 * It is worked out rather than stored, so no nightly job has to run for the
 * figures to be right, and nothing drifts when nobody opens the app for a week.
 */
export function lateFineDue(
  voucher: { dueDate: string; grossPaisa: number; discountPaisa: number; paidPaisa: number; cancelled: boolean },
  today: string,
  lateFinePaisa: number,
): number {
  if (voucher.cancelled) return 0
  if (!Number.isFinite(lateFinePaisa) || lateFinePaisa <= 0) return 0
  if (today <= voucher.dueDate) return 0
  const owedBeforeFine = Math.max(0, voucher.grossPaisa - voucher.discountPaisa) - voucher.paidPaisa
  return owedBeforeFine > 0 ? Math.trunc(lateFinePaisa) : 0
}

/** Past its due date with something still owed. */
export function isOverdue(voucher: { dueDate: string; status: FeeVoucherStatusValue }, today: string): boolean {
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
 * Whether a student should be billed for a month at all.
 *
 * Somebody admitted in October has no September bill, and somebody who left in
 * March has no April one. Their status now does not decide it: a student who
 * left owes what they owed while they were here.
 */
export function shouldBillForMonth(
  student: { admissionDate: string; leavingDate?: string | null; hasPackage: boolean },
  month: string,
): boolean {
  if (!student.hasPackage) return false
  const lastDayOfMonth = `${month.slice(0, 7)}-${String(daysInMonth(month)).padStart(2, '0')}`
  if (student.admissionDate > lastDayOfMonth) return false
  if (student.leavingDate && student.leavingDate < month) return false
  return true
}

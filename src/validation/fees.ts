import { z } from 'zod'
import { isoDate, optionalText, uuid } from './common'
import { MAX_AMOUNT_PAISA, rupeesToPaisa } from '@/lib/money'
import { FEE_HEADS, FEE_PAYMENT_METHODS, FEE_VOUCHER_STATUSES } from '@/server/fees/fees-policy'

/**
 * Fees (Phase 25, reworked in Phase 28). Every amount crosses the wire as
 * **paisa**, a whole number, so the browser and the server never disagree
 * about a rounding.
 *
 * Forms send rupees as typed; `amountPaisa` accepts either a whole number of
 * paisa or a rupee string, and turns both into paisa here, once, rather than
 * in each form.
 */
export const amountPaisa = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const paisa = typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : rupeesToPaisa(value)
    if (paisa === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount in rupees, such as 12500 or 12500.50.' })
      return z.NEVER
    }
    if (paisa > MAX_AMOUNT_PAISA) {
      ctx.addIssue({ code: 'custom', message: 'That is larger than the school allows. Check for an extra zero.' })
      return z.NEVER
    }
    return paisa
  })

/**
 * An amount that must be more than nothing.
 *
 * A concession may be nothing, but a payment of nothing is not a payment and
 * a fee line of nothing is not a charge: the database refuses both, so they
 * have to be refused here with a sentence rather than reaching it as a 500.
 */
export const positiveAmountPaisa = amountPaisa.refine((paisa) => paisa > 0, {
  error: 'Enter an amount greater than nought.',
})

export const feeVoucherStatusSchema = z.enum(FEE_VOUCHER_STATUSES)
export const feePaymentMethodSchema = z.enum(FEE_PAYMENT_METHODS, { error: 'Choose how the money was received.' })
export const feeHeadSchema = z.enum(FEE_HEADS, { error: 'Choose what the fee is for.' })

/* -------------------------------------------------------------------------- */
/* What a student is charged for a year                                       */
/* -------------------------------------------------------------------------- */

/**
 * One head with an amount. Every head is optional, so a form sends only the
 * ones that were filled in; an empty amount is left out rather than sent as
 * nought.
 */
export const feeLineSchema = z.object({
  head: feeHeadSchema,
  /** The office's own words, for a line whose head is "Others". */
  label: optionalText(80),
  amountPaisa: positiveAmountPaisa,
})

/** A student's whole fee for one academic session. */
export const studentFeePlanSchema = z.object({
  academicSessionId: uuid,
  /** Every head the office filled in. An empty list means they are charged nothing. */
  lines: z.array(feeLineSchema).max(20, 'That is more fee heads than the school has.').default([]),
  /** Taken off the year's total. */
  feeDiscountPaisa: amountPaisa.default(0),
})

/** The same lines, as an optional part of the admission form. */
export const admissionFeeSchema = z.object({
  lines: z.array(feeLineSchema).max(20, 'That is more fee heads than the school has.').default([]),
  feeDiscountPaisa: amountPaisa.default(0),
})

/* -------------------------------------------------------------------------- */
/* Vouchers                                                                   */
/* -------------------------------------------------------------------------- */

/** Issuing a session's vouchers for everybody who has a fee set for it. */
export const voucherRunSchema = z.object({
  academicSessionId: uuid,
  /** Optional: families here pay in instalments, so most vouchers carry no date. */
  dueDate: z.preprocess((v) => (v === '' || v === null ? undefined : v), isoDate.optional()),
  /** Narrows the run to one class or section. */
  sectionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  classId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  /** Says what would happen without issuing anything. */
  dryRun: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
  /**
   * At most this many vouchers in one call.
   *
   * A hosted request has a wall clock: a whole class at once was being stopped
   * part way through and answering 500. A caller that would rather come back
   * than be cut off bounds the work and repeats until nothing is left. The
   * office's own button sends nothing here and is unaffected.
   */
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const voucherCancelSchema = z.object({
  reason: z.string({ error: 'Reason is required.' }).trim().min(1, 'Reason is required.').max(255, 'Use at most 255 characters.'),
})

const optionalEnum = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === 'ALL' ? undefined : v), schema.optional())

export const voucherListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  academicSessionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  status: optionalEnum(feeVoucherStatusSchema),
  studentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  sectionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  /** Only the ones with something still owed. */
  owingOnly: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
  search: z.string().trim().max(100).optional(),
})

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export const feePaymentSchema = z.object({
  amountPaisa: positiveAmountPaisa,
  paidOn: isoDate,
  method: feePaymentMethodSchema,
  reference: optionalText(60),
  remarks: optionalText(255),
})

export const feePaymentVoidSchema = z.object({
  reason: z.string({ error: 'Reason is required.' }).trim().min(1, 'Reason is required.').max(255, 'Use at most 255 characters.'),
})

/* -------------------------------------------------------------------------- */
/* The rules the office sets                                                  */
/* -------------------------------------------------------------------------- */

export const SETTING_FEE_LATE_FINE = 'fees.late_fine_paisa'

export const feeRulesSchema = z.object({
  /** A flat fine once a due date the college set has passed; 0 means none. */
  lateFinePaisa: amountPaisa,
})

/** A student's own list. */
export const myFeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(24),
})

export type FeeLineInput = z.infer<typeof feeLineSchema>
export type StudentFeePlanInput = z.infer<typeof studentFeePlanSchema>
export type AdmissionFeeInput = z.infer<typeof admissionFeeSchema>
export type VoucherRunInput = z.infer<typeof voucherRunSchema>
export type VoucherCancelInput = z.infer<typeof voucherCancelSchema>
export type VoucherListQuery = z.infer<typeof voucherListQuerySchema>
export type FeePaymentInput = z.infer<typeof feePaymentSchema>
export type FeePaymentVoidInput = z.infer<typeof feePaymentVoidSchema>
export type FeeRulesInput = z.infer<typeof feeRulesSchema>
export type MyFeesQuery = z.infer<typeof myFeesQuerySchema>

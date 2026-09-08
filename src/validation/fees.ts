import { z } from 'zod'
import { isoDate, optionalText, requiredText, uuid } from './common'
import { MAX_AMOUNT_PAISA, rupeesToPaisa } from '@/lib/money'
import { FEE_PAYMENT_METHODS, FEE_VOUCHER_STATUSES } from '@/server/fees/fees-policy'

/**
 * Fees (Phase 25). Every amount crosses the wire as **paisa**, a whole
 * number, so the browser and the server never disagree about a rounding.
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
      ctx.addIssue({ code: 'custom', message: 'That is larger than the college allows. Check for an extra zero.' })
      return z.NEVER
    }
    return paisa
  })

/**
 * An amount that must be more than nothing.
 *
 * A package may cost nothing and a concession may be nothing, but a payment
 * of nothing is not a payment: the database refuses it, so it has to be
 * refused here with a sentence rather than reaching the database as a 500.
 */
export const positiveAmountPaisa = amountPaisa.refine((paisa) => paisa > 0, {
  error: 'Enter an amount greater than nought.',
})

export const feeVoucherStatusSchema = z.enum(FEE_VOUCHER_STATUSES)
export const feePaymentMethodSchema = z.enum(FEE_PAYMENT_METHODS, { error: 'Choose how the money was received.' })

/** A month, sent as any day within it; the service takes its first day. */
export const billingMonth = isoDate

/* -------------------------------------------------------------------------- */
/* Packages                                                                   */
/* -------------------------------------------------------------------------- */

export const feePackageCreateSchema = z.object({
  name: requiredText(120, 'Name'),
  description: optionalText(255),
  monthlyAmountPaisa: amountPaisa,
  isActive: z.boolean().default(true),
})

export const feePackageUpdateSchema = feePackageCreateSchema

/** Putting a student on a package, with their own concession on top. */
export const studentFeePlanSchema = z.object({
  feePackageId: z.preprocess((v) => (v === '' || v === null ? undefined : v), uuid.optional()),
  feeDiscountPaisa: amountPaisa.default(0),
})

/* -------------------------------------------------------------------------- */
/* Vouchers                                                                   */
/* -------------------------------------------------------------------------- */

/** Issuing a month's vouchers for everybody who should have one. */
export const voucherRunSchema = z.object({
  month: billingMonth,
  /** Overrides the office's usual due day for this run only. */
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  /** Narrows the run to one class, division, programme or section. */
  sectionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  classId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  /** Says what would happen without issuing anything. */
  dryRun: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
})

export const voucherCancelSchema = z.object({
  reason: requiredText(255, 'Reason'),
})

const optionalEnum = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === 'ALL' ? undefined : v), schema.optional())

export const voucherListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  month: billingMonth.optional(),
  status: optionalEnum(feeVoucherStatusSchema),
  studentId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  sectionId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
  /** Only the ones past their due date with something still owed. */
  overdueOnly: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
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
  reason: requiredText(255, 'Reason'),
})

/* -------------------------------------------------------------------------- */
/* The rules the office sets                                                  */
/* -------------------------------------------------------------------------- */

export const SETTING_FEE_DUE_DAY = 'fees.due_day_of_month'
export const SETTING_FEE_LATE_FINE = 'fees.late_fine_paisa'

export const feeRulesSchema = z.object({
  /** Which day of the month a voucher falls due. */
  dueDayOfMonth: z.coerce.number().int().min(1).max(31),
  /** A flat fine once that day has passed; 0 means the college charges none. */
  lateFinePaisa: amountPaisa,
})

/** A student's own list. */
export const myFeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(24),
})

export type FeePackageInput = z.infer<typeof feePackageCreateSchema>
export type StudentFeePlanInput = z.infer<typeof studentFeePlanSchema>
export type VoucherRunInput = z.infer<typeof voucherRunSchema>
export type VoucherCancelInput = z.infer<typeof voucherCancelSchema>
export type VoucherListQuery = z.infer<typeof voucherListQuerySchema>
export type FeePaymentInput = z.infer<typeof feePaymentSchema>
export type FeePaymentVoidInput = z.infer<typeof feePaymentVoidSchema>
export type FeeRulesInput = z.infer<typeof feeRulesSchema>
export type MyFeesQuery = z.infer<typeof myFeesQuerySchema>

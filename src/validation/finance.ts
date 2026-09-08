import { z } from 'zod'
import { isoDate, optionalText, requiredText } from './common'
import { positiveAmountPaisa } from './fees'
import { EXPENSE_CATEGORIES } from '@/server/finance/finance-policy'
import { FEE_PAYMENT_METHODS } from '@/server/fees/fees-policy'

/** Finance (Phase 26): what the college spent, and the delete confirmation. */
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES, { error: 'Choose what the money was spent on.' })

export const expenseCreateSchema = z.object({
  category: expenseCategorySchema,
  title: requiredText(150, 'Title'),
  amountPaisa: positiveAmountPaisa,
  spentOn: isoDate,
  method: z.enum(FEE_PAYMENT_METHODS, { error: 'Choose how it was paid.' }),
  reference: optionalText(60),
  remarks: optionalText(255),
})

export const expenseVoidSchema = z.object({
  reason: requiredText(255, 'Reason'),
})

const optionalEnum = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === 'ALL' ? undefined : v), schema.optional())

export const expenseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  /** Any day in the month being asked about. */
  month: isoDate.optional(),
  category: optionalEnum(expenseCategorySchema),
  search: z.string().trim().max(100).optional(),
})

/** The finance summary: a month, and how many months of history to graph. */
export const financeSummaryQuerySchema = z.object({
  month: isoDate.optional(),
  months: z.coerce.number().int().min(3).max(24).default(12),
})

/**
 * Erasing a record for good.
 *
 * The confirmation is the record's own code or username, not the word
 * "delete": you cannot type it without looking at which record you are on.
 */
export const deletionConfirmSchema = z.object({
  confirm: requiredText(60, 'Confirmation'),
})

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>
export type ExpenseVoidInput = z.infer<typeof expenseVoidSchema>
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>
export type DeletionConfirmInput = z.infer<typeof deletionConfirmSchema>

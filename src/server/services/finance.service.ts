/**
 * Finance (Phase 26).
 *
 * The other half of the college's money. Fees are what comes in; this is what
 * goes out, and the summary puts the two beside each other for a month and
 * across a year.
 *
 * An expense is kept exactly like a fee payment, and for the same reason:
 * never edited, never deleted, voided with a name and a reason when it was
 * recorded in error. The two sides of the ledger behave the same way, so they
 * add up the same way.
 *
 * The graphs are drawn from these figures as plain SVG, with no charting
 * library: the college's deployment carries no paid dependencies, and a bar
 * chart is a handful of rectangles.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ConflictError, NotFoundError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { assertAdminArea, paginate, paginatedResult, type PaginatedResult } from './service-utils'
import { collegeDateToStorage, storageToCollegeDate, todayInCollegeTimezone } from '../time/college-date'
import { getFeeSessionSummary } from './fees.service'
import {
  EXPENSE_CATEGORY_LABEL,
  decideCanVoidExpense,
  monthLabel,
  monthStart,
  monthsEndingAt,
  netFor,
  shortMonthLabel,
  type ExpenseCategoryValue,
  type MonthMoney,
} from '../finance/finance-policy'
import type { FeePaymentMethodValue } from '../fees/fees-policy'
import type { ExpenseCreateInput, ExpenseListQuery, ExpenseVoidInput, FinanceSummaryQuery } from '@/validation/finance'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface ExpenseView {
  id: string
  category: ExpenseCategoryValue
  categoryLabel: string
  title: string
  amountPaisa: number
  spentOn: string
  method: FeePaymentMethodValue
  reference: string | null
  remarks: string | null
  recordedBy: string | null
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
}

export interface FinanceSummary {
  month: string
  monthLabel: string
  /** This month. */
  collectedPaisa: number
  spentPaisa: number
  netPaisa: number
  /** From the fee ledger: what was billed and what is still owed. */
  billedPaisa: number
  outstandingPaisa: number
  overdueVouchers: number
  /** Spending this month, biggest first. */
  byCategory: { category: ExpenseCategoryValue; label: string; amountPaisa: number }[]
  /** One entry per month, oldest first, for the graph. */
  history: MonthMoney[]
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

function requireOffice(ctx: AuthContext, permission: 'finance.view' | 'finance.manage'): void {
  assertAdminArea(ctx, 'Finance')
  authorize(ctx, permission)
}

function toView(row: Prisma.ExpenseGetPayload<{ include: { recordedBy: { select: { fullName: true; username: true } } } }>): ExpenseView {
  return {
    id: row.id,
    category: row.category as ExpenseCategoryValue,
    categoryLabel: EXPENSE_CATEGORY_LABEL[row.category as ExpenseCategoryValue],
    title: row.title,
    amountPaisa: row.amountPaisa,
    spentOn: storageToCollegeDate(row.spentOn),
    method: row.method as FeePaymentMethodValue,
    reference: row.reference,
    remarks: row.remarks,
    recordedBy: row.recordedBy?.fullName ?? row.recordedBy?.username ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
  }
}

/** The first and last college dates of the month a date falls in. */
function monthRange(month: string): { from: Date; to: Date } {
  const first = monthStart(month)
  const [y, m] = first.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: collegeDateToStorage(first), to: collegeDateToStorage(`${first.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`) }
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

export async function listExpenses(ctx: AuthContext, query: ExpenseListQuery): Promise<PaginatedResult<ExpenseView>> {
  requireOffice(ctx, 'finance.view')

  const range = query.month ? monthRange(query.month) : null
  const where: Prisma.ExpenseWhereInput = {
    ...(range ? { spentOn: { gte: range.from, lte: range.to } } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { reference: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      include: { recordedBy: { select: { fullName: true, username: true } } },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.expense.count({ where }),
  ])

  return paginatedResult(rows.map(toView), total, query.page, query.pageSize)
}

export async function recordExpense(
  ctx: AuthContext,
  input: ExpenseCreateInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ExpenseView> {
  requireOffice(ctx, 'finance.manage')

  const today = todayInCollegeTimezone()
  if (input.spentOn > today) {
    const message = 'An expense cannot be dated in the future.'
    const { ValidationError } = await import('../api/errors')
    throw new ValidationError(message, { spentOn: [message] })
  }

  const row = await prisma.expense.create({
    data: {
      category: input.category,
      title: input.title,
      amountPaisa: input.amountPaisa,
      spentOn: collegeDateToStorage(input.spentOn),
      method: input.method,
      reference: input.reference ?? null,
      remarks: input.remarks ?? null,
      recordedByUserId: ctx.userId,
    },
    include: { recordedBy: { select: { fullName: true, username: true } } },
  })

  await writeAuditLog(ctx, {
    action: 'expense.recorded',
    entityType: 'expense',
    entityId: row.id,
    entityLabel: row.title,
    metadata: { category: input.category, amountPaisa: input.amountPaisa, spentOn: input.spentOn, method: input.method },
    request,
  })

  return toView(row)
}

export async function voidExpense(
  ctx: AuthContext,
  id: string,
  input: ExpenseVoidInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ExpenseView> {
  requireOffice(ctx, 'finance.manage')

  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true, title: true, amountPaisa: true, voidedAt: true } })
  if (!existing) throw new NotFoundError('expense')

  const decision = decideCanVoidExpense({ voidedAt: existing.voidedAt })
  if (!decision.allowed) throw new ConflictError(decision.reason)

  const row = await prisma.expense.update({
    where: { id },
    data: { voidedAt: new Date(), voidedByUserId: ctx.userId, voidReason: input.reason },
    include: { recordedBy: { select: { fullName: true, username: true } } },
  })

  await writeAuditLog(ctx, {
    action: 'expense.voided',
    entityType: 'expense',
    entityId: id,
    entityLabel: existing.title,
    metadata: { amountPaisa: existing.amountPaisa, reason: input.reason },
    request,
  })

  return toView(row)
}

/* -------------------------------------------------------------------------- */
/* The summary and its graph                                                  */
/* -------------------------------------------------------------------------- */

export async function getFinanceSummary(ctx: AuthContext, query: FinanceSummaryQuery): Promise<FinanceSummary> {
  requireOffice(ctx, 'finance.view')

  const month = monthStart(query.month ?? todayInCollegeTimezone())
  const months = monthsEndingAt(month, query.months)
  const span = { from: monthRange(months[0]!).from, to: monthRange(month).to }

  // One query for the whole range on each side, then added up in memory: a
  // year of a small college is a few hundred rows, and one pass is cheaper
  // than twenty-four round trips.
  const [payments, expenses, fees] = await Promise.all([
    prisma.feePayment.findMany({
      where: { voidedAt: null, paidOn: { gte: span.from, lte: span.to } },
      select: { amountPaisa: true, paidOn: true },
    }),
    prisma.expense.findMany({
      where: { voidedAt: null, spentOn: { gte: span.from, lte: span.to } },
      select: { amountPaisa: true, spentOn: true, category: true },
    }),
    getFeeSessionSummary(ctx),
  ])

  const collected = new Map<string, number>()
  for (const payment of payments) {
    const key = monthStart(storageToCollegeDate(payment.paidOn))
    collected.set(key, (collected.get(key) ?? 0) + payment.amountPaisa)
  }

  const spent = new Map<string, number>()
  for (const expense of expenses) {
    const key = monthStart(storageToCollegeDate(expense.spentOn))
    spent.set(key, (spent.get(key) ?? 0) + expense.amountPaisa)
  }

  const history: MonthMoney[] = months.map((m) => ({
    month: m,
    label: shortMonthLabel(m),
    collectedPaisa: collected.get(m) ?? 0,
    spentPaisa: spent.get(m) ?? 0,
  }))

  const thisMonth = history[history.length - 1]!
  const byCategory = new Map<ExpenseCategoryValue, number>()
  for (const expense of expenses) {
    if (monthStart(storageToCollegeDate(expense.spentOn)) !== month) continue
    const key = expense.category as ExpenseCategoryValue
    byCategory.set(key, (byCategory.get(key) ?? 0) + expense.amountPaisa)
  }

  return {
    month,
    monthLabel: monthLabel(month),
    collectedPaisa: thisMonth.collectedPaisa,
    spentPaisa: thisMonth.spentPaisa,
    netPaisa: netFor(thisMonth),
    billedPaisa: fees.billedPaisa,
    outstandingPaisa: fees.outstandingPaisa,
    overdueVouchers: fees.overdueVouchers,
    byCategory: [...byCategory.entries()]
      .map(([category, amountPaisa]) => ({ category, label: EXPENSE_CATEGORY_LABEL[category], amountPaisa }))
      .sort((a, b) => b.amountPaisa - a.amountPaisa),
    history,
  }
}

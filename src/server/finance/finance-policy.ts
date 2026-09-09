/**
 * Finance: what the college spent, and how a year of it is drawn.
 *
 * Pure functions, no database. Everything is whole paisa, as in the fee
 * module — the two sides of the ledger use the same arithmetic so they add up
 * the same way.
 */

export const EXPENSE_CATEGORIES = ['SALARIES', 'UTILITIES', 'RENT', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT', 'EVENTS', 'OTHER'] as const
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategoryValue, string> = {
  SALARIES: 'Salaries',
  UTILITIES: 'Utilities',
  RENT: 'Rent',
  MAINTENANCE: 'Maintenance and repairs',
  SUPPLIES: 'Supplies',
  TRANSPORT: 'Transport',
  EVENTS: 'Events',
  OTHER: 'Something else',
}

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

/** The months to graph, oldest first, ending with the one given. */
export function monthsEndingAt(month: string, count: number): string[] {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const months: string[] = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(y!, m! - 1 - back, 1))
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

/** "Sep 26", for an axis where twelve labels have to fit. */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, 1)))
  return `${name} ${String(y!).slice(2)}`
}

export interface MonthMoney {
  month: string
  label: string
  collectedPaisa: number
  spentPaisa: number
}

/** What was left after spending. Negative when the month cost more than it took. */
export function netFor(month: Pick<MonthMoney, 'collectedPaisa' | 'spentPaisa'>): number {
  return month.collectedPaisa - month.spentPaisa
}

/**
 * How tall to draw the chart.
 *
 * The tallest bar in the range, rounded up so the top of the axis is a round
 * number somebody can read. Never nought, or every bar would be full height
 * and an empty month would look like a busy one.
 */
export function chartCeiling(values: readonly number[]): number {
  const largest = Math.max(0, ...values)
  if (largest <= 0) return 100 * 100 // Rs 100, so an empty chart still has an axis.
  const magnitude = 10 ** Math.floor(Math.log10(largest))
  return Math.ceil(largest / magnitude) * magnitude
}

/** How tall one bar is, as a fraction of the plot area. Always inside 0 and 1. */
export function barFraction(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0 || ceiling <= 0) return 0
  return Math.min(1, value / ceiling)
}

export type FinanceDecision = { allowed: true } | { allowed: false; reason: string }

/** May this expense be voided? */
export function decideCanVoidExpense(expense: { voidedAt: Date | string | null }): FinanceDecision {
  if (expense.voidedAt !== null) return { allowed: false, reason: 'This expense has already been voided.' }
  return { allowed: true }
}

import { describe, expect, it } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  barFraction,
  chartCeiling,
  decideCanVoidExpense,
  monthsEndingAt,
  netFor,
  shortMonthLabel,
} from '@/server/finance/finance-policy'

/** Phase 26. The months a graph covers, how tall its bars are, and the sums. */
describe('the months on the graph', () => {
  it('ends at the month asked for, oldest first', () => {
    expect(monthsEndingAt('2026-09-01', 3)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(monthsEndingAt('2026-09-17', 1)).toEqual(['2026-09-01'])
  })

  it('walks back over a year boundary correctly', () => {
    expect(monthsEndingAt('2027-01-01', 3)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(monthsEndingAt('2026-09-01', 12)[0]).toBe('2025-10-01')
    expect(monthsEndingAt('2026-09-01', 12)).toHaveLength(12)
  })

  it('labels a month short enough for twelve to fit', () => {
    // This Node build's ICU writes "Sept" where others write "Sep", so the
    // prefix is what matters, not the exact spelling.
    expect(shortMonthLabel('2026-09-01')).toMatch(/^Sep/)
    expect(shortMonthLabel('2026-09-01')).toMatch(/ 26$/)
    expect(shortMonthLabel('2026-01-01')).toBe('Jan 26')
  })
})

describe('how tall to draw it', () => {
  it('rounds the top of the scale up to something readable', () => {
    expect(chartCeiling([1_250_000])).toBe(2_000_000)
    // Already round to one significant figure, so the tallest bar reaches the
    // top guide line exactly — which is what "top of the scale" says it does.
    expect(chartCeiling([900_000, 120_000])).toBe(900_000)
    expect(chartCeiling([4_400_000])).toBe(5_000_000)
  })

  it('never has a ceiling of nought, so an empty chart still has an axis', () => {
    expect(chartCeiling([])).toBeGreaterThan(0)
    expect(chartCeiling([0, 0])).toBeGreaterThan(0)
  })

  it('keeps every bar inside the plot', () => {
    expect(barFraction(500, 1000)).toBe(0.5)
    expect(barFraction(0, 1000)).toBe(0)
    expect(barFraction(-5, 1000)).toBe(0)
    // A bar can never be taller than the chart, whatever the arithmetic says.
    expect(barFraction(5000, 1000)).toBe(1)
    expect(barFraction(100, 0)).toBe(0)
  })
})

describe('the month’s sum', () => {
  it('is what came in less what went out, and may be negative', () => {
    expect(netFor({ collectedPaisa: 1_000_000, spentPaisa: 400_000 })).toBe(600_000)
    expect(netFor({ collectedPaisa: 100_000, spentPaisa: 400_000 })).toBe(-300_000)
    expect(netFor({ collectedPaisa: 0, spentPaisa: 0 })).toBe(0)
  })
})

describe('voiding an expense', () => {
  it('happens once, and not twice', () => {
    expect(decideCanVoidExpense({ voidedAt: null }).allowed).toBe(true)
    const second = decideCanVoidExpense({ voidedAt: new Date() })
    expect(second.allowed).toBe(false)
    if (!second.allowed) expect(second.reason).toMatch(/already been voided/)
  })
})

describe('the small print', () => {
  it('names every category in words', () => {
    for (const category of EXPENSE_CATEGORIES) expect(EXPENSE_CATEGORY_LABEL[category]).toBeTruthy()
  })
})

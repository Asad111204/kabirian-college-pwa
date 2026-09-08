/**
 * Money, in whole paisa.
 *
 * Every amount in the system is an integer number of paisa — 12,500 rupees is
 * 1,250,000 — and never a floating-point number of rupees. This is not
 * fussiness: 0.1 + 0.2 is not 0.3 in binary floating point, and a fee ledger
 * that rounds differently on two screens is a ledger nobody trusts. Integers
 * add and subtract exactly.
 *
 * Pure and dependency-free, so the browser, the server and the tests all use
 * the same arithmetic and the same words.
 */

/** One rupee. */
export const PAISA_PER_RUPEE = 100

/**
 * The largest amount the system will accept: ten million rupees, in paisa.
 * A monthly fee is thousands; anything near this is a typo with extra zeros,
 * and refusing it early is kinder than storing it.
 */
export const MAX_AMOUNT_PAISA = 10_000_000 * PAISA_PER_RUPEE

/**
 * Reads what somebody typed into a rupee box: "12500", "12,500", "12500.50",
 * "Rs 12,500". Returns whole paisa, or null when it is not a usable amount.
 *
 * Rejects more than two decimal places rather than rounding them away: if
 * somebody typed 100.567 they meant something we should not guess at.
 */
export function rupeesToPaisa(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null
    const paisa = Math.round(input * PAISA_PER_RUPEE)
    return Math.abs(input * PAISA_PER_RUPEE - paisa) < 1e-6 ? paisa : null
  }

  const cleaned = input.trim().replace(/^(rs\.?|pkr)\s*/i, '').replace(/,/g, '')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null

  const [whole, fraction = ''] = cleaned.split('.')
  const paisa = Number(whole) * PAISA_PER_RUPEE + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paisa) ? paisa : null
}

/** Paisa as a plain number of rupees, for a form box: 1250050 → "12500.50". */
export function paisaToRupeeInput(paisa: number): string {
  const whole = Math.trunc(paisa / PAISA_PER_RUPEE)
  const rest = Math.abs(paisa % PAISA_PER_RUPEE)
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`
}

/**
 * How an amount is written on a screen: "Rs 12,500", or "Rs 12,500.50" when
 * there are paisa. Whole rupees lose the ".00", because a fee list of
 * "Rs 12,500.00" repeated forty times is harder to read, not more precise.
 */
export function formatPaisa(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined || !Number.isFinite(paisa)) return '—'
  const negative = paisa < 0
  const value = Math.abs(Math.trunc(paisa))
  const whole = Math.trunc(value / PAISA_PER_RUPEE)
  const rest = value % PAISA_PER_RUPEE
  const grouped = new Intl.NumberFormat('en-PK').format(whole)
  const text = rest === 0 ? `Rs ${grouped}` : `Rs ${grouped}.${String(rest).padStart(2, '0')}`
  return negative ? `−${text}` : text
}

/** A whole, non-negative amount within the college's ceiling. */
export function isValidAmountPaisa(paisa: number): boolean {
  return Number.isInteger(paisa) && paisa >= 0 && paisa <= MAX_AMOUNT_PAISA
}

/**
 * Exact arithmetic for marks and percentages.
 *
 * Marks are stored as DECIMAL(6,2) and percentages as DECIMAL(5,2), so every
 * value in this domain is a whole number of hundredths. This module works in
 * those hundredths as plain integers — 82.50 is 8250 — and never divides in
 * floating point where a comparison depends on the answer.
 *
 * That matters because a result decides a student's year. In JavaScript
 * `0.1 + 0.2 === 0.3` is false, and a percentage computed as `49.999999...`
 * would fail a student the college intended to pass. Comparisons here are done
 * by cross-multiplying integers, so they are exact whatever the division would
 * have produced.
 *
 * Nothing here touches the database, the request, or the clock.
 */

/** A decimal as it arrives from Prisma (`.toString()`) or from a literal. */
export type DecimalInput = string | number

/** The largest value DECIMAL(6,2) can hold, in hundredths. */
const MAX_HUNDREDTHS = 99_999_999

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/

/**
 * Converts a decimal to whole hundredths: `'82.5'` and `82.5` both give `8250`.
 *
 * Anything that is not a plain, non-negative decimal of at most two places is
 * rejected rather than rounded. Silently turning `82.567` into `82.57` would
 * hide a bug in whatever produced it, and no mark in this system has a third
 * decimal place.
 */
export function toHundredths(value: DecimalInput): number {
  const text = typeof value === 'number' ? String(value) : value.trim()
  const match = DECIMAL_PATTERN.exec(text)
  if (!match) {
    throw new RangeError(`Not a mark value with at most two decimal places: ${text}`)
  }

  const whole = Number(match[1])
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const hundredths = whole * 100 + Number(fraction)

  if (!Number.isSafeInteger(hundredths) || hundredths > MAX_HUNDREDTHS) {
    throw new RangeError(`Mark value out of range: ${text}`)
  }
  return hundredths
}

/**
 * The same conversion, returning null instead of throwing.
 *
 * {@link toHundredths} is deliberately loud, because inside the calculation a
 * malformed value means a bug. Validation is the opposite case: bad input is
 * expected there, and a thrown error would surface as a 500 rather than as the
 * field message the person needs to read.
 */
export function tryHundredths(value: DecimalInput): number | null {
  try {
    return toHundredths(value)
  } catch {
    return null
  }
}

/** Formats hundredths back to a two-place decimal string: `8250` gives `'82.50'`. */
export function fromHundredths(hundredths: number): string {
  if (!Number.isSafeInteger(hundredths) || hundredths < 0) {
    throw new RangeError(`Not a whole number of hundredths: ${hundredths}`)
  }
  const whole = Math.floor(hundredths / 100)
  const fraction = hundredths % 100
  return `${whole}.${String(fraction).padStart(2, '0')}`
}

/**
 * The percentage of `obtained` out of `max`, in hundredths of a percent, rounded
 * half up — `'82.50'` out of `'100'` gives `8250`, meaning 82.50%.
 *
 * This is the number that gets *stored and shown*. It is never what a pass, a
 * fail or a grade is decided on; use {@link reachesPercentage} for that.
 */
export function percentageHundredths(obtainedHundredths: number, maxHundredths: number): number {
  if (maxHundredths <= 0) {
    throw new RangeError('Cannot take a percentage of zero maximum marks')
  }
  // percentage x 100 = obtained / max x 100 x 100, kept in integers throughout.
  const numerator = obtainedHundredths * 10_000
  const quotient = Math.floor(numerator / maxHundredths)
  const remainder = numerator - quotient * maxHundredths
  return remainder * 2 >= maxHundredths ? quotient + 1 : quotient
}

/**
 * Whether `obtained` out of `max` reaches `threshold` percent — exactly.
 *
 * Cross-multiplied, so it never consults the rounded percentage. A student on
 * 49.999% is below 50 and fails; a student on exactly 50.000% passes. Rounding
 * the percentage first would have passed both.
 *
 * All three arguments are in hundredths (50% is `5000`).
 */
export function reachesPercentage(
  obtainedHundredths: number,
  maxHundredths: number,
  thresholdHundredths: number,
): boolean {
  if (maxHundredths <= 0) {
    throw new RangeError('Cannot compare a percentage of zero maximum marks')
  }
  return obtainedHundredths * 10_000 >= thresholdHundredths * maxHundredths
}

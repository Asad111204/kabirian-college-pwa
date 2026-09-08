import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT_PAISA, formatPaisa, isValidAmountPaisa, paisaToRupeeInput, rupeesToPaisa } from '@/lib/money'

/**
 * Phase 25. Money is whole paisa everywhere, because 0.1 + 0.2 is not 0.3 in
 * binary floating point and a fee ledger that rounds differently on two
 * screens is a ledger nobody trusts.
 */
describe('reading what somebody typed', () => {
  it('takes plain rupees, commas, decimals and a currency prefix', () => {
    expect(rupeesToPaisa('12500')).toBe(1_250_000)
    expect(rupeesToPaisa('12,500')).toBe(1_250_000)
    expect(rupeesToPaisa('12500.50')).toBe(1_250_050)
    expect(rupeesToPaisa('12500.5')).toBe(1_250_050)
    expect(rupeesToPaisa('Rs 12,500')).toBe(1_250_000)
    expect(rupeesToPaisa('  0 ')).toBe(0)
  })

  it('refuses what it cannot read, rather than guessing', () => {
    expect(rupeesToPaisa('')).toBeNull()
    expect(rupeesToPaisa('twelve thousand')).toBeNull()
    expect(rupeesToPaisa('-500')).toBeNull()
    expect(rupeesToPaisa('12.345')).toBeNull()
    expect(rupeesToPaisa('1e5')).toBeNull()
  })

  it('takes a number when the caller already has one', () => {
    expect(rupeesToPaisa(12500)).toBe(1_250_000)
    expect(rupeesToPaisa(125.25)).toBe(12_525)
    expect(rupeesToPaisa(-1)).toBeNull()
    expect(rupeesToPaisa(Number.NaN)).toBeNull()
  })

  it('never loses a paisa on the way back to a form box', () => {
    for (const paisa of [0, 1, 99, 100, 1_250_000, 1_250_050]) {
      expect(rupeesToPaisa(paisaToRupeeInput(paisa))).toBe(paisa)
    }
  })
})

describe('writing an amount on a screen', () => {
  it('groups thousands and drops a pointless .00', () => {
    expect(formatPaisa(1_250_000)).toBe('Rs 12,500')
    expect(formatPaisa(1_250_050)).toBe('Rs 12,500.50')
    expect(formatPaisa(0)).toBe('Rs 0')
    expect(formatPaisa(5)).toBe('Rs 0.05')
  })

  it('says nothing rather than NaN when there is no amount', () => {
    expect(formatPaisa(null)).toBe('—')
    expect(formatPaisa(undefined)).toBe('—')
    expect(formatPaisa(Number.NaN)).toBe('—')
  })
})

describe('what the college will accept', () => {
  it('takes whole, non-negative amounts up to the ceiling', () => {
    expect(isValidAmountPaisa(0)).toBe(true)
    expect(isValidAmountPaisa(1_250_000)).toBe(true)
    expect(isValidAmountPaisa(MAX_AMOUNT_PAISA)).toBe(true)
  })

  it('refuses a negative, a fraction of a paisa, and an extra zero', () => {
    expect(isValidAmountPaisa(-1)).toBe(false)
    expect(isValidAmountPaisa(10.5)).toBe(false)
    expect(isValidAmountPaisa(MAX_AMOUNT_PAISA + 1)).toBe(false)
  })
})

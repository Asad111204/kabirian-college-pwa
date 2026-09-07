import { describe, expect, it } from 'vitest'
import { ATTENDANCE_REQUIREMENT, attendanceBand } from '@/features/attendance/bands'

/**
 * The college's attendance colour bands.
 *
 * Every boundary is tested from both sides. These four numbers decide whether a
 * student is shown as meeting the college's requirement, so an off-by-one would
 * be a quiet, believable lie rather than an obvious bug.
 */

const keyAt = (n: number) => attendanceBand(n)?.key

describe('the attendance bands', () => {
  it('has no band when there is no attendance to report', () => {
    // Not 0% — nothing has been held yet, so nothing is coloured.
    expect(attendanceBand(null)).toBeNull()
  })

  it('is red below the 75% requirement', () => {
    for (const n of [0, 1, 50, 74, 74.9]) expect(keyAt(n)).toBe('SHORT')
  })

  it('turns amber exactly at 75', () => {
    expect(keyAt(74.99)).toBe('SHORT')
    expect(keyAt(75)).toBe('MARGINAL')
  })

  it('stays amber up to but not including 80', () => {
    for (const n of [75, 76, 79, 79.99]) expect(keyAt(n)).toBe('MARGINAL')
  })

  it('turns light green exactly at 80', () => {
    expect(keyAt(79.99)).toBe('MARGINAL')
    expect(keyAt(80)).toBe('COMFORTABLE')
  })

  it('stays light green up to but not including 90', () => {
    for (const n of [80, 85, 89, 89.99]) expect(keyAt(n)).toBe('COMFORTABLE')
  })

  it('turns dark green exactly at 90, and stays there to 100', () => {
    expect(keyAt(89.99)).toBe('COMFORTABLE')
    for (const n of [90, 95, 99.9, 100]) expect(keyAt(n)).toBe('EXCELLENT')
  })

  it('does not fall apart above 100', () => {
    // Should never happen, but a rounding artefact must not become "short".
    expect(keyAt(100.5)).toBe('EXCELLENT')
  })

  it('names every band in words, so colour is never the only signal', () => {
    for (const n of [10, 77, 85, 95]) {
      const band = attendanceBand(n)
      expect(band?.label).toBeTruthy()
      expect(band?.label.length).toBeGreaterThan(5)
    }
  })

  it('gives the four bands four distinct colours', () => {
    const colours = [10, 77, 85, 95].map((n) => attendanceBand(n)?.text)
    expect(new Set(colours).size).toBe(4)
  })

  it('uses red for short and green for excellent, not the other way round', () => {
    expect(attendanceBand(50)?.text).toContain('danger')
    expect(attendanceBand(77)?.text).toContain('warning')
    expect(attendanceBand(85)?.text).toContain('success')
    expect(attendanceBand(95)?.text).toContain('success')
    // The two greens are different shades: light below 90, dark at and above it.
    expect(attendanceBand(85)?.text).not.toBe(attendanceBand(95)?.text)
  })

  it('agrees with the requirement it is named after', () => {
    expect(ATTENDANCE_REQUIREMENT).toBe(75)
    expect(keyAt(ATTENDANCE_REQUIREMENT - 0.01)).toBe('SHORT')
    expect(keyAt(ATTENDANCE_REQUIREMENT)).not.toBe('SHORT')
  })
})

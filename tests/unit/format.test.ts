import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

/** The display helpers every screen shares. */
describe('formatDate / formatDateTime', () => {
  it('formats a date the way the college writes it', () => {
    expect(formatDate('2026-08-29')).toBe('29 Aug 2026')
    expect(formatDate(new Date(2026, 0, 5))).toBe('05 Jan 2026')
  })

  it('shows a dash for nothing and for rubbish, never "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('not a date')).toBe('—')
    expect(formatDateTime('not a date')).toBe('Never')
    expect(formatDateTime(null)).toBe('Never')
  })

  it('includes the time of day for a moment', () => {
    expect(formatDateTime(new Date(2026, 7, 29, 14, 5))).toMatch(/29 Aug 2026, 14:05/)
  })
})

describe('formatBytes', () => {
  it('uses the units a file listing uses', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatBytes(15.4 * 1024 * 1024)).toBe('15 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })

  it('shows a dash for nothing', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('cn', () => {
  it('joins class names and lets the later Tailwind class win', () => {
    expect(cn('p-2', false && 'hidden', 'p-4')).toBe('p-4')
    expect(cn('text-sm', undefined, 'font-medium')).toBe('text-sm font-medium')
  })
})

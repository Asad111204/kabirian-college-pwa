/**
 * Display formatting helpers.
 *
 * These are plain functions with no React and no 'use client' marker, so BOTH
 * server components and client components can call them. (A function exported
 * from a 'use client' module can only be rendered as a component from the
 * server — it cannot be called directly.)
 */

/** 29 Aug 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** 29 Aug 2026, 14:05 — or "Never" when there is no value. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Never'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return 'Never'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Human-readable file size. Used for Drive storage and upload limits.
 * Uses the units people expect on a file listing (1 KB = 1024 bytes).
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`
}

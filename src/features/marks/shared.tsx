import * as React from 'react'
import { CircleSlash, FileEdit, MinusCircle, Send, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import {
  MARK_SHEET_STATUS_LABEL,
  MARK_STATUS_LABEL,
  type MarkSheetStatusValue,
  type MarkStatusValue,
} from '@/validation/marks'

/**
 * Pieces shared by the teacher's paper list, the mark sheet and the admin
 * monitor.
 *
 * No `'use client'` here: these are presentational with no state, so whichever
 * side of the boundary imports them decides where they render.
 */

const MARK_STATUS_STYLE: Record<
  MarkStatusValue,
  { variant: 'neutral' | 'success' | 'warning' | 'danger'; Icon: typeof MinusCircle }
> = {
  PENDING: { variant: 'warning', Icon: MinusCircle },
  ENTERED: { variant: 'success', Icon: Sparkles },
  ABSENT: { variant: 'danger', Icon: CircleSlash },
}

/**
 * A mark's state, in words as well as colour.
 *
 * "Not entered" is deliberately not the same word as anything to do with zero:
 * the whole point of the three states is that nobody reads a blank as a mark.
 */
export function MarkStatusBadge({ status }: { status: MarkStatusValue }) {
  const style = MARK_STATUS_STYLE[status] ?? MARK_STATUS_STYLE.PENDING
  const { Icon } = style
  return (
    <Badge variant={style.variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {MARK_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

const SHEET_STATUS_STYLE: Record<
  MarkSheetStatusValue,
  { variant: 'warning' | 'success' | 'info'; Icon: typeof FileEdit }
> = {
  DRAFT: { variant: 'warning', Icon: FileEdit },
  SUBMITTED: { variant: 'success', Icon: Send },
  PUBLISHED: { variant: 'info', Icon: Sparkles },
}

export function MarkSheetStatusBadge({ status }: { status: MarkSheetStatusValue | null }) {
  if (status === null) return <Badge variant="neutral">Not started</Badge>
  const style = SHEET_STATUS_STYLE[status] ?? SHEET_STATUS_STYLE.DRAFT
  const { Icon } = style
  return (
    <Badge variant={style.variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {MARK_SHEET_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export interface Counts {
  total: number
  entered: number
  absent: number
  pending: number
}

/**
 * How far through a sheet is.
 *
 * Absent is counted on its own rather than folded into "done", because a
 * teacher scanning a list wants to see at a glance how many students did not
 * sit the paper.
 */
export function CountsSummary({ counts, className }: { counts: Counts; className?: string }) {
  const tiles = [
    { label: 'Students', value: counts.total, tone: 'text-foreground' },
    { label: 'Entered', value: counts.entered, tone: 'text-success-700' },
    { label: 'Absent', value: counts.absent, tone: 'text-danger-700' },
    { label: 'Not entered', value: counts.pending, tone: 'text-warning-700' },
  ]

  return (
    <dl className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2">
          <dt className="text-xs text-foreground-muted">{tile.label}</dt>
          <dd className={cn('text-lg font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** `12 of 30 entered`, for a compact row. */
export function progressLabel(counts: Counts): string {
  const done = counts.entered + counts.absent
  return `${done} of ${counts.total} marked`
}

/** Shows a stored mark, or an honest dash when there is none. */
export function markLabel(status: MarkStatusValue, obtainedMarks: string | null): string {
  if (status === 'ABSENT') return 'Absent'
  if (status === 'PENDING' || obtainedMarks === null) return '—'
  return obtainedMarks.replace(/\.00$/, '')
}

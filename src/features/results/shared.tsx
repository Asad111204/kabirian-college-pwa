import * as React from 'react'
import { CircleSlash, Send, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import {
  RESULT_OUTCOME_LABEL,
  RESULT_STATUS_LABEL,
  type ResultOutcomeValue,
  type ResultStatusValue,
} from '@/validation/results'

/**
 * Pieces shared by the result review screen and the breakdown dialog.
 *
 * No `'use client'`: presentational only, so either side of the boundary can
 * render them — which the student and staff result screens will need later.
 */

const OUTCOME_STYLE: Record<
  ResultOutcomeValue,
  { variant: 'success' | 'danger' | 'warning'; Icon: typeof ThumbsUp }
> = {
  PASS: { variant: 'success', Icon: ThumbsUp },
  FAIL: { variant: 'danger', Icon: ThumbsDown },
  INCOMPLETE: { variant: 'warning', Icon: TriangleAlert },
}

/** An outcome is never communicated by colour alone. */
export function OutcomeBadge({ outcome }: { outcome: ResultOutcomeValue }) {
  const style = OUTCOME_STYLE[outcome] ?? OUTCOME_STYLE.INCOMPLETE
  const { Icon } = style
  return (
    <Badge variant={style.variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {RESULT_OUTCOME_LABEL[outcome] ?? outcome}
    </Badge>
  )
}

export function ResultStatusBadge({ status }: { status: ResultStatusValue }) {
  return (
    <Badge variant={status === 'PUBLISHED' ? 'success' : 'neutral'} className="gap-1">
      {status === 'PUBLISHED' ? <Send className="h-3 w-3" aria-hidden /> : null}
      {RESULT_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

/** How a subject went, for the breakdown table. */
export function SubjectOutcomeBadge({
  outcome,
  status,
}: {
  outcome: 'PASS' | 'FAIL' | 'PENDING'
  status: 'PENDING' | 'ENTERED' | 'ABSENT'
}) {
  // Absence is its own fact, shown ahead of the pass or fail it implies.
  if (status === 'ABSENT') {
    return (
      <Badge variant="danger" className="gap-1">
        <CircleSlash className="h-3 w-3" aria-hidden />
        Absent
      </Badge>
    )
  }
  if (outcome === 'PENDING') return <Badge variant="warning">Not marked</Badge>
  return (
    <Badge variant={outcome === 'PASS' ? 'success' : 'danger'}>
      {outcome === 'PASS' ? 'Pass' : 'Fail'}
    </Badge>
  )
}

export interface Summary {
  total: number
  passed: number
  failed: number
  incomplete: number
  published: number
  passPercentage: string | null
}

/**
 * The headline figures.
 *
 * With no results at all the tiles are not shown: "0 passed, 0%" reads like a
 * disaster rather than like nothing having happened yet.
 */
export function SummaryTiles({ summary, className }: { summary: Summary; className?: string }) {
  const tiles = [
    { label: 'Students', value: String(summary.total), tone: 'text-foreground' },
    { label: 'Passed', value: String(summary.passed), tone: 'text-success-700' },
    { label: 'Failed', value: String(summary.failed), tone: 'text-danger-700' },
    { label: 'Incomplete', value: String(summary.incomplete), tone: 'text-warning-700' },
    {
      label: 'Pass rate',
      // Null when nobody has a complete result — not 0%.
      value: summary.passPercentage === null ? '—' : `${summary.passPercentage}%`,
      tone: 'text-foreground',
    },
  ]

  return (
    <dl className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2">
          <dt className="text-xs text-foreground-muted">{tile.label}</dt>
          <dd className={cn('text-lg font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** `82.50%`, or an honest dash where a percentage would mislead. */
export function percentageLabel(percentage: string | null): string {
  return percentage === null ? '—' : `${percentage}%`
}

/** `1st`, `2nd`, `3rd` — or a dash for a result that is not ranked. */
export function positionLabel(position: number | null): string {
  if (position === null) return '—'
  const tens = position % 100
  if (tens >= 11 && tens <= 13) return `${position}th`
  switch (position % 10) {
    case 1:
      return `${position}st`
    case 2:
      return `${position}nd`
    case 3:
      return `${position}rd`
    default:
      return `${position}th`
  }
}

/** Marks come from DECIMAL columns; show them without inventing decimals. */
export function marksLabel(value: string | null): string {
  if (value === null) return '—'
  return value.replace(/\.00$/, '')
}

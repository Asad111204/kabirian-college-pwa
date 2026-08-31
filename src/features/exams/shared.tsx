import * as React from 'react'
import { CalendarCheck, CircleSlash, FileEdit, PenLine, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EXAM_STATUS_LABEL, type ExamStatusValue } from '@/validation/exams'

/**
 * Pieces shared by the exam list, the exam detail screen and the date sheet.
 *
 * No `'use client'` here: these are presentational with no state, so whichever
 * side of the boundary imports them decides where they render.
 */

const EXAM_STATUS_STYLE: Record<
  ExamStatusValue,
  { variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; Icon: typeof FileEdit }
> = {
  DRAFT: { variant: 'warning', Icon: FileEdit },
  SCHEDULED: { variant: 'info', Icon: CalendarCheck },
  MARKS_ENTRY: { variant: 'info', Icon: PenLine },
  COMPLETED: { variant: 'success', Icon: Trophy },
  CANCELLED: { variant: 'neutral', Icon: CircleSlash },
}

/** A status carries an icon and a word, never colour alone. */
export function ExamStatusBadge({ status }: { status: ExamStatusValue }) {
  const style = EXAM_STATUS_STYLE[status] ?? EXAM_STATUS_STYLE.DRAFT
  const { Icon } = style
  return (
    <Badge variant={style.variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {EXAM_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export function DateSheetBadge({ published }: { published: boolean }) {
  return (
    <Badge variant={published ? 'success' : 'neutral'}>
      {published ? 'Published' : 'Not published'}
    </Badge>
  )
}

/**
 * Formats `2026-05-10` as `10 May 2026`, in UTC.
 *
 * A date sheet is the one place a shifted day would be a genuine error — a
 * student turning up on the wrong morning — so the value is anchored to UTC on
 * the way in and formatted in UTC on the way out. `new Date('2026-05-10')` is
 * parsed as UTC midnight and then *displayed* in the reader's own zone, which
 * moves the day backwards for anyone west of Greenwich.
 */
export function formatExamDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

/** `09:00 – 12:00`, or just the start when there is no end. */
export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  return end ? `${start} – ${end}` : start
}

/** Marks come from DECIMAL columns as strings; show them without inventing decimals. */
export function formatMarks(value: string): string {
  return value.replace(/\.00$/, '')
}

/** "Pre-Medical", or the honest label for a paper the whole class sits. */
export function programLabel(programName: string | null): string {
  return programName ?? 'All programmes'
}

export function DateRange({ from, to }: { from: string | null; to: string | null }) {
  if (!from && !to) return <span className="text-foreground-subtle">Not set</span>
  if (from && to && from !== to) {
    return (
      <span>
        {formatExamDate(from)} – {formatExamDate(to)}
      </span>
    )
  }
  return <span>{formatExamDate(from ?? to)}</span>
}

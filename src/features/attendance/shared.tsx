import * as React from 'react'
import { Check, CircleSlash, Clock, FileText, Send, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { ATTENDANCE_STATUS_LABEL, SHEET_STATUS_LABEL } from '@/validation/attendance'

/**
 * Pieces shared by the attendance list and the register screen.
 *
 * No `'use client'` here: these are presentational components with no state, so
 * they can be rendered from either side of the boundary. Whichever imports them
 * decides.
 */

export type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'
export type SheetStatusValue = 'DRAFT' | 'SUBMITTED' | 'CANCELLED'

export interface AttendanceCounts {
  present: number
  absent: number
  late: number
  leave: number
}

/**
 * Every status carries an icon and a word as well as a colour.
 *
 * Colour alone would be unreadable for anyone with colour blindness, and
 * unreadable in a photocopied register.
 */
const SHEET_STATUS_STYLE: Record<
  SheetStatusValue,
  { variant: 'neutral' | 'success' | 'warning' | 'danger'; Icon: typeof FileText }
> = {
  DRAFT: { variant: 'warning', Icon: FileText },
  SUBMITTED: { variant: 'success', Icon: Send },
  CANCELLED: { variant: 'neutral', Icon: CircleSlash },
}

export function SheetStatusBadge({ status }: { status: SheetStatusValue }) {
  const style = SHEET_STATUS_STYLE[status] ?? SHEET_STATUS_STYLE.DRAFT
  const { Icon } = style
  return (
    <Badge variant={style.variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {SHEET_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export const STATUS_ORDER: AttendanceStatusValue[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE']

export const STATUS_ICON: Record<AttendanceStatusValue, typeof Check> = {
  PRESENT: Check,
  ABSENT: X,
  LATE: Clock,
  LEAVE: CircleSlash,
}

/** Short forms for the segmented control, where space is tight. */
export const STATUS_SHORT: Record<AttendanceStatusValue, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  LEAVE: 'Lv',
}

const STATUS_SELECTED: Record<AttendanceStatusValue, string> = {
  PRESENT: 'bg-success-600 text-white border-success-600',
  ABSENT: 'bg-danger-600 text-white border-danger-600',
  LATE: 'bg-warning-600 text-white border-warning-600',
  LEAVE: 'bg-info-600 text-white border-info-600',
}

/**
 * The marking control: four buttons, one click each.
 *
 * A dropdown would mean two clicks and a scan of a menu for every student in a
 * class of forty. These are radio buttons underneath, so arrow keys move between
 * them and a screen reader announces the group and the chosen value.
 */
export function StatusPicker({
  value,
  onChange,
  disabled,
  studentName,
}: {
  value: AttendanceStatusValue
  onChange: (status: AttendanceStatusValue) => void
  disabled?: boolean
  studentName: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Attendance for ${studentName}`}
      className="inline-flex rounded-[var(--radius-control)] border border-border p-0.5"
    >
      {STATUS_ORDER.map((status) => {
        const Icon = STATUS_ICON[status]
        const selected = value === status
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${ATTENDANCE_STATUS_LABEL[status]} — ${studentName}`}
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(
              'flex min-h-8 items-center gap-1 rounded-[calc(var(--radius-control)-2px)] border border-transparent px-2 text-xs font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? STATUS_SELECTED[status]
                : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{ATTENDANCE_STATUS_LABEL[status]}</span>
            <span className="sm:hidden">{STATUS_SHORT[status]}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A compact "27P · 1L · 2A" line for the register list. */
export function CountsSummary({ counts }: { counts: AttendanceCounts }) {
  const parts = STATUS_ORDER.map((status) => {
    const value =
      status === 'PRESENT'
        ? counts.present
        : status === 'ABSENT'
          ? counts.absent
          : status === 'LATE'
            ? counts.late
            : counts.leave
    return { status, value }
  }).filter((p) => p.value > 0)

  if (parts.length === 0) return <span className="text-foreground-subtle">—</span>

  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {parts.map(({ status, value }) => {
        const Icon = STATUS_ICON[status]
        return (
          <span key={status} className="inline-flex items-center gap-0.5 text-foreground-muted">
            <Icon className="h-3 w-3" aria-hidden />
            {value}
            <span className="sr-only"> {ATTENDANCE_STATUS_LABEL[status]}</span>
          </span>
        )
      })}
    </span>
  )
}

/**
 * The figures at the top of a register.
 *
 * The percentage comes from the server, which owns the rule (LATE counts as
 * present; LEAVE does not, unless the college's setting says otherwise). It is
 * never recalculated here — two formulas would eventually disagree.
 */
export function AttendanceSummaryTiles({
  counts,
  total,
  percentage,
  countsTowardsPercentage,
}: {
  counts: AttendanceCounts
  total: number
  percentage: number | null
  /** False for a draft or cancelled register, which count towards nothing. */
  countsTowardsPercentage: boolean
}) {
  const tiles = [
    { label: 'Students', value: total },
    { label: ATTENDANCE_STATUS_LABEL.PRESENT, value: counts.present },
    { label: ATTENDANCE_STATUS_LABEL.ABSENT, value: counts.absent },
    { label: ATTENDANCE_STATUS_LABEL.LATE, value: counts.late },
    { label: ATTENDANCE_STATUS_LABEL.LEAVE, value: counts.leave },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-[var(--radius-control)] border border-border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            {tile.label}
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{tile.value}</p>
        </div>
      ))}

      <div className="rounded-[var(--radius-control)] border border-border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Attendance
        </p>
        {!countsTowardsPercentage ? (
          <p className="mt-0.5 text-sm text-foreground-muted">Not counted yet</p>
        ) : percentage === null ? (
          <p className="mt-0.5 text-sm text-foreground-muted">No attendance recorded yet</p>
        ) : (
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{percentage}%</p>
        )}
      </div>
    </div>
  )
}

/** Subject-wise registers show the subject; daily ones say so plainly. */
export function subjectLabel(subjectName: string | null): string {
  return subjectName ?? 'Daily roll call'
}

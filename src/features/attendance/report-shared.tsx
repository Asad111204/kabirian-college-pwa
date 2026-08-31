import * as React from 'react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ATTENDANCE_STATUS_LABEL } from '@/validation/attendance'

/**
 * The pieces every attendance report is built from.
 *
 * No `'use client'`: these are presentational, so either side of the boundary
 * can render them.
 */

export interface Summary {
  present: number
  absent: number
  late: number
  leave: number
  total: number
  attended: number
  percentage: number | null
}

export interface BreakdownRow extends Summary {
  id: string
  label: string
  detail?: string
  sheets: number
}

/**
 * A percentage, or an honest statement that there is nothing to report.
 *
 * Zero counted sessions is not 0% — that would read as "never attends" when it
 * means "no classes have been held".
 */
export function Percentage({
  value,
  className,
}: {
  value: number | null
  className?: string
}) {
  if (value === null) {
    return <span className={className ?? 'text-sm text-foreground-muted'}>No attendance yet</span>
  }
  return <span className={className ?? 'tabular-nums'}>{value}%</span>
}

/**
 * A bar showing how a group's attendance falls.
 *
 * Deliberately not a chart library: a handful of divs, and every segment is also
 * stated as a number in the row beside it, so the bar adds emphasis rather than
 * carrying information on its own.
 */
export function AttendanceBar({ summary }: { summary: Summary }) {
  if (summary.total === 0) return null

  const pct = (n: number) => (n / summary.total) * 100
  const segments = [
    { key: 'PRESENT', value: summary.present, className: 'bg-success-600' },
    { key: 'LATE', value: summary.late, className: 'bg-warning-600' },
    { key: 'LEAVE', value: summary.leave, className: 'bg-info-600' },
    { key: 'ABSENT', value: summary.absent, className: 'bg-danger-600' },
  ] as const

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      role="img"
      aria-label={segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.value} ${ATTENDANCE_STATUS_LABEL[s.key].toLowerCase()}`)
        .join(', ')}
    >
      {segments.map((segment) =>
        segment.value > 0 ? (
          <div
            key={segment.key}
            className={segment.className}
            style={{ width: `${pct(segment.value)}%` }}
          />
        ) : null,
      )}
    </div>
  )
}

/** The headline figures. */
export function SummaryTiles({
  summary,
  extra,
}: {
  summary: Summary
  extra?: Array<{ label: string; value: number | string }>
}) {
  const tiles = [
    ...(extra ?? []),
    { label: 'Attendance records', value: summary.total },
    { label: ATTENDANCE_STATUS_LABEL.PRESENT, value: summary.present },
    { label: ATTENDANCE_STATUS_LABEL.LATE, value: summary.late },
    { label: ATTENDANCE_STATUS_LABEL.ABSENT, value: summary.absent },
    { label: ATTENDANCE_STATUS_LABEL.LEAVE, value: summary.leave },
  ]

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground-muted">Overall attendance</p>
          {summary.total === 0 ? (
            <p className="mt-1 text-base font-medium">No attendance recorded yet</p>
          ) : (
            <>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{summary.percentage}%</p>
              <p className="mt-0.5 text-sm text-foreground-muted">
                {summary.attended} of {summary.total} attended
              </p>
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <dt className="text-xs text-foreground-muted">{tile.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{tile.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {summary.total > 0 ? (
        <div className="mt-3">
          <AttendanceBar summary={summary} />
        </div>
      ) : null}
    </Card>
  )
}

/** One breakdown table — by class, division, program, section or subject. */
export function BreakdownTable({
  title,
  rows,
  firstColumn,
  emptyMessage,
}: {
  title: string
  rows: BreakdownRow[]
  firstColumn: string
  emptyMessage?: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
        {title}
      </h2>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={emptyMessage ?? 'No attendance matches these filters'}
            description="Try a wider date range, or clear the filters."
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>{firstColumn}</TH>
                  <TH>Registers</TH>
                  <TH>Records</TH>
                  <TH>{ATTENDANCE_STATUS_LABEL.PRESENT}</TH>
                  <TH>{ATTENDANCE_STATUS_LABEL.LATE}</TH>
                  <TH>{ATTENDANCE_STATUS_LABEL.ABSENT}</TH>
                  <TH>{ATTENDANCE_STATUS_LABEL.LEAVE}</TH>
                  <TH>Attendance</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <p className="font-medium">{row.label}</p>
                      {row.detail ? (
                        <p className="text-xs text-foreground-muted">{row.detail}</p>
                      ) : null}
                    </TD>
                    <TD className="tabular-nums">{row.sheets}</TD>
                    <TD className="tabular-nums">{row.total}</TD>
                    <TD className="tabular-nums">{row.present}</TD>
                    <TD className="tabular-nums">{row.late}</TD>
                    <TD className="tabular-nums">{row.absent}</TD>
                    <TD className="tabular-nums">{row.leave}</TD>
                    <TD>
                      <Percentage value={row.percentage} className="font-semibold tabular-nums" />
                      <div className="mt-1 w-24">
                        <AttendanceBar summary={row} />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>
    </section>
  )
}

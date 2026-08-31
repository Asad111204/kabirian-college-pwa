'use client'

import * as React from 'react'
import { CalendarDays, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUSES } from '@/validation/attendance'
import { STATUS_ICON, type AttendanceStatusValue } from './shared'

interface Summary {
  present: number
  absent: number
  late: number
  leave: number
  total: number
  attended: number
  percentage: number | null
}

interface SubjectSummary extends Summary {
  subjectId: string | null
  subjectName: string
}

interface HistoryRow {
  date: string
  period: number
  subjectId: string | null
  subjectName: string
  status: AttendanceStatusValue
}

export interface MyAttendanceData {
  enrollment: {
    academicSessionId: string
    sessionName: string
    className: string
    divisionName: string
    programName: string
    sectionName: string
    rollNumber: string | null
  } | null
  overall: Summary
  bySubject: SubjectSummary[]
  daily: SubjectSummary | null
  history: {
    items: HistoryRow[]
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  subjectsInHistory: Array<{ id: string | null; name: string }>
}

type Range = 'all' | '7' | '30' | 'month' | 'custom'

/**
 * A student's own attendance.
 *
 * Read-only by construction: there is not a single control here that changes
 * anything, and the API it reads takes no student id — the record shown is
 * always the signed-in student's.
 *
 * Every percentage comes from the server, which owns the rule. Nothing on this
 * page does its own arithmetic.
 */
export function StudentAttendanceView({ initial }: { initial: MyAttendanceData }) {
  const [data, setData] = React.useState(initial)
  const [range, setRange] = React.useState<Range>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * The date window, worked out from the chosen preset. Kept as a derived value
   * so a preset and a custom range cannot disagree with each other.
   */
  const window = React.useMemo(() => {
    const today = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    if (range === '7') {
      const start = new Date(today)
      start.setUTCDate(start.getUTCDate() - 6)
      return { dateFrom: iso(start), dateTo: undefined }
    }
    if (range === '30') {
      const start = new Date(today)
      start.setUTCDate(start.getUTCDate() - 29)
      return { dateFrom: iso(start), dateTo: undefined }
    }
    if (range === 'month') {
      return {
        dateFrom: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
        dateTo: undefined,
      }
    }
    if (range === 'custom') return { dateFrom: from || undefined, dateTo: to || undefined }
    return { dateFrom: undefined, dateTo: undefined }
  }, [range, from, to])

  const query = React.useMemo(() => {
    const params = new URLSearchParams()
    if (window.dateFrom) params.set('dateFrom', window.dateFrom)
    if (window.dateTo) params.set('dateTo', window.dateTo)
    if (subject) params.set('subject', subject)
    if (status) params.set('status', status)
    if (page > 1) params.set('page', String(page))
    return params.toString()
  }, [window, subject, status, page])

  /**
   * The server already sent the unfiltered first page, so that state is stamped
   * as loaded. "Loading" is then *derived* — the query on screen differs from
   * the one whose data we hold — rather than being assigned inside an effect,
   * which keeps the two from ever disagreeing.
   */
  const [loadedQuery, setLoadedQuery] = React.useState('')
  const loading = query !== loadedQuery

  React.useEffect(() => {
    if (query === loadedQuery) return

    let cancelled = false
    api
      .get<MyAttendanceData>(`/api/v1/attendance/my${query ? `?${query}` : ''}`)
      .then((fresh) => {
        if (cancelled) return
        setData(fresh)
        setError(null)
        setLoadedQuery(query)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your attendance. Please check your connection.',
        )
        // Stamp it anyway, so a failed request does not retry forever.
        setLoadedQuery(query)
      })

    return () => {
      cancelled = true
    }
  }, [query, loadedQuery])

  const hasFilter = Boolean(window.dateFrom || window.dateTo || subject || status)

  return (
    <div className="space-y-4">
      {data.enrollment ? (
        <p className="text-sm text-foreground-muted">
          {data.enrollment.sessionName} · {data.enrollment.className} ·{' '}
          {data.enrollment.divisionName} · {data.enrollment.programName} · Section{' '}
          {data.enrollment.sectionName}
          {data.enrollment.rollNumber ? ` · Roll ${data.enrollment.rollNumber}` : ''}
        </p>
      ) : (
        <Alert variant="warning" title="Not currently enrolled">
          You are not currently enrolled in an active section. Please contact the college office.
        </Alert>
      )}

      {error ? (
        <Alert variant="danger" title="Could not load your attendance">
          {error}
        </Alert>
      ) : null}

      <OverallCard summary={data.overall} />

      {data.daily ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            Daily roll call
          </h2>
          <SubjectCard summary={data.daily} />
        </section>
      ) : null}

      {data.bySubject.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            By subject
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.bySubject.map((subjectSummary) => (
              <SubjectCard key={subjectSummary.subjectId} summary={subjectSummary} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          My attendance record
        </h2>

        <Card className="overflow-hidden">
          <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="f-range" className="sr-only">
                Date range
              </label>
              <Select
                id="f-range"
                value={range}
                onChange={(e) => {
                  setRange(e.target.value as Range)
                  setPage(1)
                }}
              >
                <option value="all">All dates</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom range…</option>
              </Select>
            </div>

            <div>
              <label htmlFor="f-subject" className="sr-only">
                Subject
              </label>
              <Select
                id="f-subject"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All subjects</option>
                {data.subjectsInHistory.map((s) => (
                  <option key={s.id ?? 'DAILY'} value={s.id ?? 'DAILY'}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="f-status" className="sr-only">
                Status
              </label>
              <Select
                id="f-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All statuses</option>
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ATTENDANCE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>

            {range === 'custom' ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  aria-label="From date"
                />
                <span className="text-xs text-foreground-muted">to</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  aria-label="To date"
                />
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-2 p-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading your attendance…</span>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data.history.items.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={hasFilter ? 'No attendance matches these filters' : 'No attendance recorded yet'}
              description={
                hasFilter
                  ? 'Try a wider date range, or clear the filters.'
                  : 'Your attendance will appear here once your teachers start submitting registers.'
              }
              action={
                hasFilter ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRange('all')
                      setFrom('')
                      setTo('')
                      setSubject('')
                      setStatus('')
                      setPage(1)
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Subject</TH>
                      <TH>Period</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.history.items.map((row, index) => (
                      <TR key={`${row.date}-${row.period}-${row.subjectId ?? 'daily'}-${index}`}>
                        <TD className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <CalendarDays
                              className="h-3.5 w-3.5 shrink-0 text-foreground-muted"
                              aria-hidden
                            />
                            {formatDate(row.date)}
                          </span>
                        </TD>
                        <TD>{row.subjectName}</TD>
                        <TD className="tabular-nums">{row.period}</TD>
                        <TD>
                          <StatusText status={row.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>

              <div className="border-t border-border p-3">
                <Pagination
                  page={data.history.page}
                  pageSize={data.history.pageSize}
                  total={data.history.total}
                  totalPages={data.history.totalPages}
                  onPageChange={setPage}
                  disabled={loading}
                />
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  )
}

/** Status as an icon **and** a word — never colour on its own. */
function StatusText({ status }: { status: AttendanceStatusValue }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
      {ATTENDANCE_STATUS_LABEL[status]}
    </span>
  )
}

function OverallCard({ summary }: { summary: Summary }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground-muted">Overall attendance</p>
          {summary.total === 0 ? (
            <p className="mt-1 text-base font-medium">No attendance recorded yet</p>
          ) : (
            <p className="mt-1 text-4xl font-semibold tabular-nums">{summary.percentage}%</p>
          )}
          {summary.total > 0 ? (
            <p className="mt-0.5 text-sm text-foreground-muted">
              {summary.attended} of {summary.total} classes attended
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {(
            [
              ['PRESENT', summary.present],
              ['ABSENT', summary.absent],
              ['LATE', summary.late],
              ['LEAVE', summary.leave],
            ] as const
          ).map(([status, value]) => (
            <div key={status}>
              <dt className="text-xs text-foreground-muted">{ATTENDANCE_STATUS_LABEL[status]}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}

function SubjectCard({ summary }: { summary: SubjectSummary }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{summary.subjectName}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {summary.total} session{summary.total === 1 ? '' : 's'} · {summary.present} present ·{' '}
            {summary.late} late · {summary.absent} absent · {summary.leave} leave
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          {summary.percentage === null ? '—' : `${summary.percentage}%`}
        </p>
      </div>
    </Card>
  )
}

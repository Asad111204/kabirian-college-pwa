'use client'

import * as React from 'react'
import Link from 'next/link'
import { BookOpen, ClipboardCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_STATUS_LABEL } from '@/validation/attendance'
import { Percentage, SummaryTiles, type Summary } from './report-shared'

export interface TeacherScope {
  kind: 'subject' | 'daily'
  sectionId: string
  subjectId: string | null
  subjectName: string | null
  className: string
  divisionName: string
  programName: string
  sectionName: string
}

interface Overview {
  overall: Summary & { sheets: number; students: number }
}

interface StudentRow extends Summary {
  studentId: string
  studentCode: string
  fullName: string
}

interface RegisterRow {
  id: string
  date: string
  period: number
  sectionName: string
  subjectName: string | null
  students: number
  present: number
  absent: number
  late: number
  leave: number
}

interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type Range = 'all' | '7' | '30' | 'month' | 'custom'

/**
 * A teacher's attendance report.
 *
 * The scope list comes from the server, built from this teacher's own
 * assignments and in-charge records — there is no free-text section or subject
 * to type. And even if a request were crafted by hand, the reporting queries AND
 * the same scope clause into every statement, so a section they do not teach
 * simply contributes nothing.
 */
export function TeacherAttendanceReport({
  scopes,
  today,
}: {
  scopes: TeacherScope[]
  today: string
}) {
  const [selected, setSelected] = React.useState(0)
  const [range, setRange] = React.useState<Range>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [tab, setTab] = React.useState<'students' | 'registers'>('students')
  const [page, setPage] = React.useState(1)

  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [students, setStudents] = React.useState<Paged<StudentRow> | null>(null)
  const [registers, setRegisters] = React.useState<Paged<RegisterRow> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const scope = scopes[selected]

  const window = React.useMemo(() => {
    const now = new Date(`${today}T00:00:00.000Z`)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const back = (days: number) => {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - days)
      return iso(d)
    }
    if (range === '7') return { dateFrom: back(6), dateTo: undefined }
    if (range === '30') return { dateFrom: back(29), dateTo: undefined }
    if (range === 'month') return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: undefined }
    if (range === 'custom') return { dateFrom: from || undefined, dateTo: to || undefined }
    return { dateFrom: undefined, dateTo: undefined }
  }, [range, from, to, today])

  const invalidRange = Boolean(window.dateFrom && window.dateTo && window.dateFrom > window.dateTo)

  const query = React.useMemo(() => {
    if (!scope) return ''
    const params = new URLSearchParams()
    params.set('sectionId', scope.sectionId)
    if (scope.subjectId) params.set('subjectId', scope.subjectId)
    else params.set('kind', 'daily')
    if (window.dateFrom) params.set('dateFrom', window.dateFrom)
    if (window.dateTo) params.set('dateTo', window.dateTo)
    return params.toString()
  }, [scope, window])

  const [loadedSummary, setLoadedSummary] = React.useState<string | null>(null)
  const summaryLoading = !invalidRange && Boolean(scope) && query !== loadedSummary

  React.useEffect(() => {
    if (!scope || invalidRange || query === loadedSummary) return
    let cancelled = false
    api
      .get<Overview>(`/api/v1/attendance/reports/summary?${query}`)
      .then((data) => {
        if (cancelled) return
        setOverview(data)
        setError(null)
        setLoadedSummary(query)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the report.')
        setLoadedSummary(query)
      })
    return () => {
      cancelled = true
    }
  }, [scope, query, loadedSummary, invalidRange])

  const detailQuery = `${query}&page=${page}`
  const [loadedDetail, setLoadedDetail] = React.useState<string | null>(null)
  const detailKey = `${tab}|${detailQuery}`
  const detailLoading = !invalidRange && Boolean(scope) && detailKey !== loadedDetail

  React.useEffect(() => {
    if (!scope || invalidRange || detailKey === loadedDetail) return
    let cancelled = false
    const url =
      tab === 'students'
        ? `/api/v1/attendance/reports/students?${detailQuery}&sort=percentage_asc`
        : `/api/v1/attendance/reports/registers?${detailQuery}`

    api
      .get<Paged<StudentRow> | Paged<RegisterRow>>(url)
      .then((data) => {
        if (cancelled) return
        if (tab === 'students') setStudents(data as Paged<StudentRow>)
        else setRegisters(data as Paged<RegisterRow>)
        setError(null)
        setLoadedDetail(detailKey)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the report.')
        setLoadedDetail(detailKey)
      })
    return () => {
      cancelled = true
    }
  }, [scope, tab, detailQuery, detailKey, loadedDetail, invalidRange])

  if (scopes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No attendance assignments yet"
        description="Ask the administrator to assign your subjects, or to make you the in-charge of a section."
        action={
          <Button variant="secondary" asChild>
            <Link href="/staff/assignments">View my assignments</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="scope" className="mb-1 block text-xs font-medium text-foreground-muted">
              What to report on
            </label>
            <Select
              id="scope"
              value={String(selected)}
              onChange={(e) => {
                setSelected(Number(e.target.value))
                setPage(1)
              }}
            >
              {scopes.map((s, index) => (
                <option key={`${s.sectionId}-${s.subjectId ?? 'daily'}`} value={index}>
                  {s.kind === 'daily' ? 'Daily roll call' : s.subjectName} — {s.className} ·{' '}
                  {s.divisionName} · {s.programName} · Section {s.sectionName}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="range" className="mb-1 block text-xs font-medium text-foreground-muted">
              Date range
            </label>
            <Select
              id="range"
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

          {range === 'custom' ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
              <span className="text-xs text-foreground-muted">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </div>
          ) : null}
        </div>
      </Card>

      {scope ? (
        <p className="flex items-center gap-2 text-sm text-foreground-muted">
          {scope.kind === 'daily' ? (
            <Users className="h-4 w-4" aria-hidden />
          ) : (
            <BookOpen className="h-4 w-4" aria-hidden />
          )}
          {scope.kind === 'daily' ? 'Daily roll call' : scope.subjectName} · {scope.className} ·{' '}
          {scope.divisionName} · {scope.programName} · Section {scope.sectionName}
        </p>
      ) : null}

      {invalidRange ? (
        <Alert variant="danger" title="Check the dates">
          The start date must be on or before the end date.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="danger" title="Could not load the report">
          {error}
        </Alert>
      ) : null}

      {summaryLoading || !overview ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <SummaryTiles
          summary={overview.overall}
          extra={[
            { label: 'Registers', value: overview.overall.sheets },
            { label: 'Students', value: overview.overall.students },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['students', 'Students'],
            ['registers', 'My registers'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key)
              setPage(1)
            }}
            aria-pressed={tab === key}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              tab === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground-muted hover:border-border-strong'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {detailLoading ? (
          <div className="space-y-2 p-3">
            <span className="sr-only">Loading…</span>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : tab === 'students' ? (
          !students || students.items.length === 0 ? (
            <EmptyState
              title="No attendance recorded yet"
              description="Figures appear here once you submit registers for this class."
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Student</TH>
                      <TH>Records</TH>
                      <TH>{ATTENDANCE_STATUS_LABEL.PRESENT}</TH>
                      <TH>{ATTENDANCE_STATUS_LABEL.LATE}</TH>
                      <TH>{ATTENDANCE_STATUS_LABEL.ABSENT}</TH>
                      <TH>{ATTENDANCE_STATUS_LABEL.LEAVE}</TH>
                      <TH>Attendance</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {students.items.map((row) => (
                      <TR key={row.studentId}>
                        <TD>
                          <p className="font-medium">{row.fullName}</p>
                          <p className="text-xs text-foreground-muted">{row.studentCode}</p>
                        </TD>
                        <TD className="tabular-nums">{row.total}</TD>
                        <TD className="tabular-nums">{row.present}</TD>
                        <TD className="tabular-nums">{row.late}</TD>
                        <TD className="tabular-nums">{row.absent}</TD>
                        <TD className="tabular-nums">{row.leave}</TD>
                        <TD>
                          <Percentage value={row.percentage} className="font-semibold tabular-nums" />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
              <div className="border-t border-border p-3">
                <Pagination
                  page={students.page}
                  pageSize={students.pageSize}
                  total={students.total}
                  totalPages={students.totalPages}
                  onPageChange={setPage}
                />
              </div>
            </>
          )
        ) : !registers || registers.items.length === 0 ? (
          <EmptyState
            title="No registers yet"
            description="Only submitted registers appear in reports."
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Period</TH>
                    <TH>Students</TH>
                    <TH>{ATTENDANCE_STATUS_LABEL.PRESENT}</TH>
                    <TH>{ATTENDANCE_STATUS_LABEL.ABSENT}</TH>
                  </TR>
                </THead>
                <TBody>
                  {registers.items.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap">{formatDate(row.date)}</TD>
                      <TD className="tabular-nums">{row.period}</TD>
                      <TD className="tabular-nums">{row.students}</TD>
                      <TD className="tabular-nums">{row.present}</TD>
                      <TD className="tabular-nums">{row.absent}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <div className="border-t border-border p-3">
              <Pagination
                page={registers.page}
                pageSize={registers.pageSize}
                total={registers.total}
                totalPages={registers.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

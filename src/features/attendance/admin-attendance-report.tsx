'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_STATUS_LABEL, STUDENT_REPORT_SORTS } from '@/validation/attendance'
import { BreakdownTable, Percentage, SummaryTiles, type BreakdownRow, type Summary } from './report-shared'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'

interface Overview {
  overall: Summary & { sheets: number; students: number }
  byClass: BreakdownRow[]
  byDivision: BreakdownRow[]
  byProgram: BreakdownRow[]
  bySection: BreakdownRow[]
  bySubject: BreakdownRow[]
  includesDaily: boolean
}

interface StudentRow extends Summary {
  studentId: string
  studentCode: string
  fullName: string
}

interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface RegisterRow {
  id: string
  date: string
  period: number
  className: string
  divisionName: string
  programName: string
  sectionName: string
  subjectName: string | null
  markedByName: string
  students: number
  present: number
  absent: number
  late: number
  leave: number
}

type Range = 'all' | 'today' | '7' | '30' | 'month' | 'custom'
type Tab = 'summary' | 'students' | 'registers'

const SORT_LABEL: Record<(typeof STUDENT_REPORT_SORTS)[number], string> = {
  percentage_asc: 'Lowest attendance first',
  percentage_desc: 'Highest attendance first',
  name: 'Student name',
  code: 'Student code',
}

/**
 * Admin → Attendance → Reports.
 *
 * Every figure is counted by the database. This component chooses filters and
 * renders what comes back; it does no arithmetic of its own, so it cannot drift
 * from the college's attendance rule.
 *
 * The class, division, program and section dropdowns narrow each other from one
 * list read out of the database, so a program added this morning is already
 * there and nothing about the college's structure is written into this file.
 */
export function AdminAttendanceReport({
  initialOverview,
  sessions,
  groups,
  subjects,
  staff,
  today,
}: {
  initialOverview: Overview
  sessions: { id: string; name: string; isCurrent: boolean }[]
  groups: EnrollmentOptionGroup[]
  subjects: { id: string; name: string }[]
  staff: { id: string; fullName: string }[]
  today: string
}) {
  const [tab, setTab] = React.useState<Tab>('summary')

  const [sessionId, setSessionId] = React.useState(
    sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? '',
  )
  const [range, setRange] = React.useState<Range>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [classId, setClassId] = React.useState('')
  const [divisionId, setDivisionId] = React.useState('')
  const [programId, setProgramId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [kind, setKind] = React.useState<'all' | 'daily' | 'subject'>('all')
  const [staffId, setStaffId] = React.useState('')
  const [sort, setSort] = React.useState<(typeof STUDENT_REPORT_SORTS)[number]>('percentage_asc')
  const [page, setPage] = React.useState(1)

  const [overview, setOverview] = React.useState(initialOverview)
  const [students, setStudents] = React.useState<Paged<StudentRow> | null>(null)
  const [registers, setRegisters] = React.useState<Paged<RegisterRow> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const window = React.useMemo(() => {
    const now = new Date(`${today}T00:00:00.000Z`)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const back = (days: number) => {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - days)
      return iso(d)
    }
    if (range === 'today') return { dateFrom: today, dateTo: today }
    if (range === '7') return { dateFrom: back(6), dateTo: undefined }
    if (range === '30') return { dateFrom: back(29), dateTo: undefined }
    if (range === 'month') {
      return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: undefined }
    }
    if (range === 'custom') return { dateFrom: from || undefined, dateTo: to || undefined }
    return { dateFrom: undefined, dateTo: undefined }
  }, [range, from, to, today])

  const invalidRange = Boolean(
    window.dateFrom && window.dateTo && window.dateFrom > window.dateTo,
  )

  const filterQuery = React.useMemo(() => {
    const params = new URLSearchParams()
    if (sessionId) params.set('academicSessionId', sessionId)
    if (window.dateFrom) params.set('dateFrom', window.dateFrom)
    if (window.dateTo) params.set('dateTo', window.dateTo)
    if (classId) params.set('classId', classId)
    if (divisionId) params.set('divisionId', divisionId)
    if (programId) params.set('programId', programId)
    if (sectionId) params.set('sectionId', sectionId)
    if (subjectId) params.set('subjectId', subjectId)
    if (kind !== 'all') params.set('kind', kind)
    return params.toString()
  }, [sessionId, window, classId, divisionId, programId, sectionId, subjectId, kind])

  /* ----------------------------- data loading ---------------------------- */

  /**
   * The server already rendered the report for the current session with no
   * other filters, so that query is stamped as loaded. Without this the page
   * would throw away perfectly good server-rendered data and refetch on mount —
   * a skeleton flash, an extra request, and an empty first paint.
   */
  const [loadedSummary, setLoadedSummary] = React.useState(() =>
    new URLSearchParams(
      sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id
        ? { academicSessionId: sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? '' }
        : {},
    ).toString(),
  )
  const summaryLoading = !invalidRange && filterQuery !== loadedSummary

  React.useEffect(() => {
    if (invalidRange || filterQuery === loadedSummary) return
    let cancelled = false
    api
      .get<Overview>(`/api/v1/attendance/reports/summary?${filterQuery}`)
      .then((data) => {
        if (cancelled) return
        setOverview(data)
        setError(null)
        setLoadedSummary(filterQuery)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the report.')
        setLoadedSummary(filterQuery)
      })
    return () => {
      cancelled = true
    }
  }, [filterQuery, loadedSummary, invalidRange])

  const studentQuery = `${filterQuery}&sort=${sort}&page=${page}`
  const [loadedStudents, setLoadedStudents] = React.useState('')
  const studentsLoading = tab === 'students' && !invalidRange && studentQuery !== loadedStudents

  React.useEffect(() => {
    if (tab !== 'students' || invalidRange || studentQuery === loadedStudents) return
    let cancelled = false
    api
      .get<Paged<StudentRow>>(`/api/v1/attendance/reports/students?${studentQuery}`)
      .then((data) => {
        if (cancelled) return
        setStudents(data)
        setError(null)
        setLoadedStudents(studentQuery)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the student report.')
        setLoadedStudents(studentQuery)
      })
    return () => {
      cancelled = true
    }
  }, [tab, studentQuery, loadedStudents, invalidRange])

  const registerQuery = `${filterQuery}${staffId ? `&staffId=${staffId}` : ''}&page=${page}`
  const [loadedRegisters, setLoadedRegisters] = React.useState('')
  const registersLoading = tab === 'registers' && !invalidRange && registerQuery !== loadedRegisters

  React.useEffect(() => {
    if (tab !== 'registers' || invalidRange || registerQuery === loadedRegisters) return
    let cancelled = false
    api
      .get<Paged<RegisterRow>>(`/api/v1/attendance/reports/registers?${registerQuery}`)
      .then((data) => {
        if (cancelled) return
        setRegisters(data)
        setError(null)
        setLoadedRegisters(registerQuery)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the register report.')
        setLoadedRegisters(registerQuery)
      })
    return () => {
      cancelled = true
    }
  }, [tab, registerQuery, loadedRegisters, invalidRange])

  /* ------------------------------ cascading ------------------------------- */

  const classes = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) seen.set(g.classId, g.className)
    return [...seen.entries()]
  }, [groups])

  const divisions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      seen.set(g.divisionId, g.divisionName)
    }
    return [...seen.entries()]
  }, [groups, classId])

  const programs = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      if (divisionId && g.divisionId !== divisionId) continue
      seen.set(g.programId, g.programName)
    }
    return [...seen.entries()]
  }, [groups, classId, divisionId])

  const sections = React.useMemo(() => {
    const list: [string, string][] = []
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      if (divisionId && g.divisionId !== divisionId) continue
      if (programId && g.programId !== programId) continue
      for (const s of g.sections) list.push([s.id, `${g.programName} · Section ${s.name}`])
    }
    return list
  }, [groups, classId, divisionId, programId])

  function reset() {
    setRange('all')
    setFrom('')
    setTo('')
    setClassId('')
    setDivisionId('')
    setProgramId('')
    setSectionId('')
    setSubjectId('')
    setKind('all')
    setStaffId('')
    setPage(1)
  }

  const hasFilter =
    range !== 'all' || classId || divisionId || programId || sectionId || subjectId || kind !== 'all' || staffId

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            aria-label="Academic session"
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value)
              setClassId('')
              setDivisionId('')
              setProgramId('')
              setSectionId('')
              setPage(1)
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Date range"
            value={range}
            onChange={(e) => {
              setRange(e.target.value as Range)
              setPage(1)
            }}
          >
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range…</option>
          </Select>

          <Select
            aria-label="Class or year"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value)
              setDivisionId('')
              setProgramId('')
              setSectionId('')
              setPage(1)
            }}
          >
            <option value="">All classes</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Division"
            value={divisionId}
            onChange={(e) => {
              setDivisionId(e.target.value)
              setProgramId('')
              setSectionId('')
              setPage(1)
            }}
          >
            <option value="">All divisions</option>
            {divisions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Program"
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value)
              setSectionId('')
              setPage(1)
            }}
          >
            <option value="">All programs</option>
            {programs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Section"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All sections</option>
            {sections.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Attendance type"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as 'all' | 'daily' | 'subject')
              setSubjectId('')
              setPage(1)
            }}
          >
            <option value="all">All attendance</option>
            <option value="daily">Daily roll call</option>
            <option value="subject">Subject attendance</option>
          </Select>

          {kind !== 'daily' ? (
            <Select
              aria-label="Subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}

          {range === 'custom' ? (
            <div className="flex items-center gap-2 sm:col-span-2">
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

        {hasFilter ? (
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

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

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['summary', 'Summary'],
            ['students', 'Students'],
            ['registers', 'Registers taken'],
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

      {tab === 'summary' ? (
        summaryLoading ? (
          <ReportSkeleton />
        ) : (
          <div className="space-y-4">
            <SummaryTiles
              summary={overview.overall}
              extra={[
                { label: 'Registers', value: overview.overall.sheets },
                { label: 'Students', value: overview.overall.students },
              ]}
            />
            <BreakdownTable title="By class" firstColumn="Class / Year" rows={overview.byClass} />
            <BreakdownTable title="By division" firstColumn="Division" rows={overview.byDivision} />
            <BreakdownTable title="By program" firstColumn="Program" rows={overview.byProgram} />
            <BreakdownTable title="By section" firstColumn="Section" rows={overview.bySection} />
            <BreakdownTable
              title="By subject"
              firstColumn="Subject"
              rows={overview.bySubject}
              emptyMessage="No subject attendance in this selection"
            />
          </div>
        )
      ) : null}

      {tab === 'students' ? (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Student attendance
            </h2>
            <Select
              aria-label="Sort students"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as (typeof STUDENT_REPORT_SORTS)[number])
                setPage(1)
              }}
              className="w-auto"
            >
              {STUDENT_REPORT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          <Card className="overflow-hidden">
            {studentsLoading ? (
              <div className="space-y-2 p-3">
                <span className="sr-only">Loading…</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !students || students.items.length === 0 ? (
              <EmptyState
                title={hasFilter ? 'No attendance matches these filters' : 'No attendance recorded yet'}
                description={
                  hasFilter
                    ? 'Try a wider date range, or clear the filters.'
                    : 'Student figures appear once teachers submit registers.'
                }
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
                    disabled={studentsLoading}
                  />
                </div>
              </>
            )}
          </Card>
        </section>
      ) : null}

      {tab === 'registers' ? (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Registers taken
            </h2>
            <Select
              aria-label="Marked by"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value)
                setPage(1)
              }}
              className="w-auto"
            >
              <option value="">Any teacher</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </Select>
          </div>

          <Card className="overflow-hidden">
            {registersLoading ? (
              <div className="space-y-2 p-3">
                <span className="sr-only">Loading…</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !registers || registers.items.length === 0 ? (
              <EmptyState
                title="No registers match these filters"
                description="Only submitted registers appear in reports."
              />
            ) : (
              <>
                <TableWrapper>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Class</TH>
                        <TH>Subject</TH>
                        <TH>Taken by</TH>
                        <TH>Students</TH>
                        <TH>{ATTENDANCE_STATUS_LABEL.ABSENT}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {registers.items.map((row) => (
                        <TR key={row.id}>
                          <TD className="whitespace-nowrap">
                            {formatDate(row.date)}
                            <span className="block text-xs text-foreground-muted">
                              Period {row.period}
                            </span>
                          </TD>
                          <TD>
                            <p className="text-sm">Section {row.sectionName}</p>
                            <p className="text-xs text-foreground-muted">
                              {row.className} · {row.divisionName} · {row.programName}
                            </p>
                          </TD>
                          <TD>{row.subjectName ?? 'Daily roll call'}</TD>
                          <TD className="whitespace-nowrap">{row.markedByName}</TD>
                          <TD className="tabular-nums">{row.students}</TD>
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
                    disabled={registersLoading}
                  />
                </div>
              </>
            )}
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading the report…</span>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

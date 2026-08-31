'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ClipboardCheck, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SHEET_STATUSES, SHEET_STATUS_LABEL } from '@/validation/attendance'
import { formatDate } from '@/lib/format'
import { CountsSummary, SheetStatusBadge, subjectLabel } from './shared'
import type { AttendanceCounts, SheetStatusValue } from './shared'
import { CreateSheetDialog, type StaffOption } from './create-sheet-dialog'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'

export interface SheetRow {
  id: string
  date: string
  period: number
  status: SheetStatusValue
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  subjectId: string | null
  subjectName: string | null
  markedByName: string
  studentCount: number
  counts: AttendanceCounts
}

export interface SheetFilters {
  academicSessionId: string
  classId: string
  divisionId: string
  programId: string
  sectionId: string
  subjectId: string
  staffId: string
  status: string
  date: string
  dateFrom: string
  dateTo: string
}

/**
 * Admin → Attendance.
 *
 * Filtering and paging happen on the SERVER: every change rewrites the URL and
 * one page of registers comes back. The browser never holds the college's
 * attendance history.
 *
 * `classId`, `divisionId` and `programId` are not filters the API understands —
 * they narrow the *section* dropdown here, and it is the resulting `sectionId`
 * that is sent. That keeps the API surface small and means the server has one
 * thing to authorise rather than four.
 */
export function AttendanceList({
  sheets,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  sessions,
  groupsBySession,
  subjects,
  staff,
  today,
  canCreate,
}: {
  sheets: SheetRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: SheetFilters
  sessions: { id: string; name: string; isCurrent: boolean }[]
  groupsBySession: Record<string, EnrollmentOptionGroup[]>
  subjects: { id: string; name: string }[]
  staff: StaffOption[]
  today: string
  canCreate: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [createOpen, setCreateOpen] = React.useState(false)

  const applyFilters = React.useCallback(
    (changes: Partial<SheetFilters> & { page?: number }) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1

      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '' || value === 'ALL') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() =>
        router.push(query ? `/admin/attendance?${query}` : '/admin/attendance'),
      )
    },
    [filters, page, router],
  )

  // Memoised so the dropdown lists below do not rebuild on every keystroke.
  const groups = React.useMemo(
    () => groupsBySession[filters.academicSessionId] ?? [],
    [groupsBySession, filters.academicSessionId],
  )

  const classes = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) seen.set(g.classId, g.className)
    return [...seen.entries()]
  }, [groups])

  const divisions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (filters.classId && g.classId !== filters.classId) continue
      seen.set(g.divisionId, g.divisionName)
    }
    return [...seen.entries()]
  }, [groups, filters.classId])

  const programs = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (filters.classId && g.classId !== filters.classId) continue
      if (filters.divisionId && g.divisionId !== filters.divisionId) continue
      seen.set(g.programId, g.programName)
    }
    return [...seen.entries()]
  }, [groups, filters.classId, filters.divisionId])

  const sections = React.useMemo(() => {
    const list: [string, string][] = []
    for (const g of groups) {
      if (filters.classId && g.classId !== filters.classId) continue
      if (filters.divisionId && g.divisionId !== filters.divisionId) continue
      if (filters.programId && g.programId !== filters.programId) continue
      for (const s of g.sections) list.push([s.id, `${g.programName} · Section ${s.name}`])
    }
    return list
  }, [groups, filters.classId, filters.divisionId, filters.programId])

  const hasFilter = Object.entries(filters).some(
    ([key, value]) => key !== 'academicSessionId' && value !== '',
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ key: '', label: 'All' }, ...SHEET_STATUSES.map((s) => ({ key: s, label: SHEET_STATUS_LABEL[s] }))].map(
            (tab) => {
              const active = filters.status === tab.key
              return (
                <button
                  key={tab.key || 'ALL'}
                  onClick={() => applyFilters({ status: tab.key })}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface text-foreground-muted hover:border-border-strong'
                  }`}
                >
                  {tab.label}
                </button>
              )
            },
          )}
        </div>

        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Open a register
          </Button>
        ) : null}
      </div>

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sr-only" htmlFor="f-session">
            Academic session
          </label>
          <Select
            id="f-session"
            value={filters.academicSessionId}
            onChange={(e) =>
              applyFilters({
                academicSessionId: e.target.value,
                classId: '',
                divisionId: '',
                programId: '',
                sectionId: '',
              })
            }
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-class">
            Class or year
          </label>
          <Select
            id="f-class"
            value={filters.classId}
            onChange={(e) =>
              applyFilters({ classId: e.target.value, divisionId: '', programId: '', sectionId: '' })
            }
          >
            <option value="">All classes</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-division">
            Division
          </label>
          <Select
            id="f-division"
            value={filters.divisionId}
            onChange={(e) => applyFilters({ divisionId: e.target.value, programId: '', sectionId: '' })}
          >
            <option value="">All divisions</option>
            {divisions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-program">
            Program
          </label>
          <Select
            id="f-program"
            value={filters.programId}
            onChange={(e) => applyFilters({ programId: e.target.value, sectionId: '' })}
          >
            <option value="">All programs</option>
            {programs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-section">
            Section
          </label>
          <Select
            id="f-section"
            value={filters.sectionId}
            onChange={(e) => applyFilters({ sectionId: e.target.value })}
          >
            <option value="">All sections</option>
            {sections.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-subject">
            Subject
          </label>
          <Select
            id="f-subject"
            value={filters.subjectId}
            onChange={(e) => applyFilters({ subjectId: e.target.value })}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-staff">
            Marked by
          </label>
          <Select
            id="f-staff"
            value={filters.staffId}
            onChange={(e) => applyFilters({ staffId: e.target.value })}
          >
            <option value="">Any teacher</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="f-from">
              From date
            </label>
            <Input
              id="f-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => applyFilters({ dateFrom: e.target.value, date: '' })}
              aria-label="From date"
            />
            <span className="text-xs text-foreground-muted">to</span>
            <label className="sr-only" htmlFor="f-to">
              To date
            </label>
            <Input
              id="f-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => applyFilters({ dateTo: e.target.value, date: '' })}
              aria-label="To date"
            />
          </div>
        </div>

        {hasFilter ? (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                applyFilters({
                  classId: '',
                  divisionId: '',
                  programId: '',
                  sectionId: '',
                  subjectId: '',
                  staffId: '',
                  status: '',
                  date: '',
                  dateFrom: '',
                  dateTo: '',
                })
              }
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      {sheets.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={hasFilter ? 'No registers match these filters' : 'No attendance has been recorded yet'}
          description={
            hasFilter
              ? 'Try a wider date range, or clear the filters.'
              : 'Open a register to start taking attendance for a section.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Period</TH>
                  <TH>Class</TH>
                  <TH>Section</TH>
                  <TH>Subject</TH>
                  <TH>Taken by</TH>
                  <TH>Status</TH>
                  <TH>Attendance</TH>
                  <TH><span className="sr-only">Actions</span></TH>
                </TR>
              </THead>
              <TBody>
                {sheets.map((sheet) => (
                  <TR key={sheet.id} className={pending ? 'opacity-60' : undefined}>
                    <TD className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
                        {formatDate(sheet.date)}
                      </span>
                    </TD>
                    <TD className="tabular-nums">{sheet.period}</TD>
                    <TD>
                      <span className="text-sm">{sheet.className}</span>
                      <span className="block text-xs text-foreground-muted">
                        {sheet.divisionName} · {sheet.programName}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap">Section {sheet.sectionName}</TD>
                    <TD>
                      {sheet.subjectName ? (
                        sheet.subjectName
                      ) : (
                        <span className="text-foreground-muted">{subjectLabel(null)}</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{sheet.markedByName}</TD>
                    <TD>
                      <SheetStatusBadge status={sheet.status} />
                    </TD>
                    <TD>
                      <CountsSummary counts={sheet.counts} />
                      <span className="block text-xs text-foreground-subtle">
                        {sheet.studentCount} student{sheet.studentCount === 1 ? '' : 's'}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/attendance/${sheet.id}`}>Open</Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          <div className="border-t border-border p-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={(next) => applyFilters({ page: next })}
              disabled={pending}
            />
          </div>
        </Card>
      )}

      {sessions.length === 0 ? (
        <Alert variant="warning" className="mt-4" title="No academic session yet">
          Create an academic session and its structure before taking attendance.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      ) : null}

      {canCreate ? (
        <CreateSheetDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          sessions={sessions}
          groupsBySession={groupsBySession}
          staff={staff}
          today={today}
        />
      ) : null}
    </>
  )
}

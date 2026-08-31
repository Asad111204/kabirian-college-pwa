'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, GraduationCap, Plus, Search, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { STUDENT_STATUS_LABEL, STUDENT_STATUSES } from '@/validation/students'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'

export interface StudentRow {
  id: string
  studentCode: string
  admissionNumber: string
  fullName: string
  fatherName: string
  status: string
  placement: {
    className: string
    divisionName: string
    programName: string
    sectionName: string
    sessionName: string
    rollNumber: string | null
  } | null
  account: { username: string; isActive: boolean } | null
}

export interface StudentFilters {
  search: string
  sessionId: string
  classId: string
  divisionId: string
  programId: string
  sectionId: string
  status: string
  sort: string
  direction: string
}

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  LEFT: 'danger',
  GRADUATED: 'info',
  TRANSFERRED_OUT: 'warning',
}

/**
 * The student list.
 *
 * Search, filters, sorting and paging all run on the SERVER — changing any of
 * them updates the URL and one page of results comes back. The browser never
 * receives the whole student table.
 *
 * Every filter is an id read from the database, so a newly created program or
 * section appears in the dropdowns automatically.
 */
export function StudentsTable({
  students,
  page,
  pageSize,
  total,
  totalPages,
  counts,
  filters,
  sessions,
  groups,
}: {
  students: StudentRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counts: Record<string, number>
  filters: StudentFilters
  sessions: { id: string; name: string; isCurrent: boolean }[]
  groups: EnrollmentOptionGroup[]
}) {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState(filters.search)
  const [pending, startTransition] = React.useTransition()

  const applyFilters = React.useCallback(
    (changes: Record<string, string | number | undefined>) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1

      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '' || value === 'ALL') continue
        if (key === 'page' && value === 1) continue
        if (key === 'sort' && value === 'fullName') continue
        if (key === 'direction' && value === 'asc') continue
        if (key === 'status' && value === 'ACTIVE') continue
        next.set(key, String(value))
      }

      const query = next.toString()
      startTransition(() => router.push(query ? `/admin/students?${query}` : '/admin/students'))
    },
    [filters, page, router],
  )

  // The dropdown choices narrow the same way as the enrollment form.
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
      for (const s of g.sections) {
        list.push([s.id, `${g.programName} · Section ${s.name}`])
      }
    }
    return list
  }, [groups, filters.classId, filters.divisionId, filters.programId])

  const hasAcademicFilter = Boolean(
    filters.classId || filters.divisionId || filters.programId || filters.sectionId,
  )

  function toggleSort(column: string) {
    const direction = filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc'
    applyFilters({ sort: column, direction })
  }

  return (
    <>
      {/* Status tabs with live counts */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ key: 'ALL', label: 'All' }, ...STUDENT_STATUSES.map((s) => ({ key: s, label: STUDENT_STATUS_LABEL[s] }))].map(
          (tab) => {
            const active = filters.status === tab.key
            const count = counts[tab.key] ?? 0
            if (tab.key !== 'ALL' && tab.key !== 'ACTIVE' && count === 0 && !active) return null
            return (
              <button
                key={tab.key}
                onClick={() => applyFilters({ status: tab.key })}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-foreground-muted hover:border-border-strong'
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 text-xs ${
                    active ? 'bg-white/20' : 'bg-surface-muted text-foreground-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          },
        )}
      </div>

      <Card>
        {/* Search + add */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              applyFilters({ search: searchInput })
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, student ID, admission number or roll number…"
              className="pl-9"
              aria-label="Search students"
            />
          </form>

          <Button size="sm" asChild className="shrink-0">
            <Link href="/admin/students/new">
              <Plus className="h-4 w-4" />
              Add student
            </Link>
          </Button>
        </div>

        {/* Academic filters */}
        <div className="grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={filters.sessionId}
            onChange={(e) => applyFilters({ sessionId: e.target.value, classId: '', divisionId: '', programId: '', sectionId: '' })}
            aria-label="Filter by academic session"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
                {session.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>

          <Select
            value={filters.classId}
            onChange={(e) => applyFilters({ classId: e.target.value, divisionId: '', programId: '', sectionId: '' })}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.divisionId}
            onChange={(e) => applyFilters({ divisionId: e.target.value, programId: '', sectionId: '' })}
            aria-label="Filter by division"
          >
            <option value="">All divisions</option>
            {divisions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.programId}
            onChange={(e) => applyFilters({ programId: e.target.value, sectionId: '' })}
            aria-label="Filter by program"
          >
            <option value="">All programs</option>
            {programs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.sectionId}
            onChange={(e) => applyFilters({ sectionId: e.target.value })}
            aria-label="Filter by section"
          >
            <option value="">All sections</option>
            {sections.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {(hasAcademicFilter || filters.search) && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('')
                applyFilters({ search: '', classId: '', divisionId: '', programId: '', sectionId: '' })
              }}
            >
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          </div>
        )}

        {students.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={
              filters.search
                ? `No students match "${filters.search}"`
                : hasAcademicFilter
                  ? 'No students in this selection'
                  : 'No students yet'
            }
            description={
              filters.search || hasAcademicFilter
                ? 'Try a different search or clear the filters.'
                : 'Admit your first student to get started.'
            }
            action={
              filters.search || hasAcademicFilter ? null : (
                <Button size="sm" asChild>
                  <Link href="/admin/students/new">
                    <Plus className="h-4 w-4" />
                    Add student
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>
                    <SortButton label="Student" column="fullName" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH className="hidden sm:table-cell">
                    <SortButton label="Student ID" column="studentCode" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH className="hidden lg:table-cell">
                    <SortButton label="Admission no." column="admissionNumber" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH>Placement</TH>
                  <TH className="hidden md:table-cell">Roll</TH>
                  <TH>Status</TH>
                  <TH className="hidden xl:table-cell">Account</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>

              <TBody>
                {students.map((student) => (
                  <TR key={student.id} className={pending ? 'opacity-60' : undefined}>
                    <TD>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/students/${student.id}`}
                          className="truncate font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {student.fullName}
                        </Link>
                        <p className="truncate text-xs text-foreground-muted">
                          s/o {student.fatherName}
                        </p>
                        <p className="truncate font-mono text-xs text-foreground-subtle sm:hidden">
                          {student.studentCode}
                        </p>
                      </div>
                    </TD>

                    <TD className="hidden sm:table-cell">
                      <code className="text-xs">{student.studentCode}</code>
                    </TD>

                    <TD className="hidden lg:table-cell">
                      <code className="text-xs">{student.admissionNumber}</code>
                    </TD>

                    <TD>
                      {student.placement ? (
                        <div className="text-sm">
                          <p className="text-foreground">
                            {student.placement.className} · {student.placement.divisionName}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {student.placement.programName} · Section {student.placement.sectionName}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-foreground-subtle">Not enrolled</span>
                      )}
                    </TD>

                    <TD className="hidden md:table-cell">
                      {student.placement?.rollNumber ? (
                        <span className="text-sm tabular-nums">{student.placement.rollNumber}</span>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </TD>

                    <TD>
                      <Badge variant={STATUS_VARIANT[student.status] ?? 'neutral'}>
                        {STUDENT_STATUS_LABEL[student.status as keyof typeof STUDENT_STATUS_LABEL] ??
                          student.status}
                      </Badge>
                    </TD>

                    <TD className="hidden xl:table-cell">
                      {student.account ? (
                        <div className="text-xs">
                          <code>{student.account.username}</code>
                          {!student.account.isActive ? (
                            <p className="text-danger-600">inactive</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground-subtle">No account</span>
                      )}
                    </TD>

                    <TD>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/students/${student.id}`}>
                            <Settings2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Open</span>
                          </Link>
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          disabled={pending}
          onPageChange={(next) => applyFilters({ page: next })}
        />
      </Card>
    </>
  )
}

function SortButton({
  label,
  column,
  filters,
  onSort,
}: {
  label: string
  column: string
  filters: StudentFilters
  onSort: (column: string) => void
}) {
  const active = filters.sort === column
  return (
    <button
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
    </button>
  )
}

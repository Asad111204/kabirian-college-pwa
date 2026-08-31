'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type {
  TeacherResultOptions,
  TeacherResultRow,
} from '@/server/services/results.service'
import { marksLabel, percentageLabel, SubjectOutcomeBadge } from './shared'

export interface TeacherResultFilters {
  search: string
  examId: string
  classId: string
  programId: string
  sectionId: string
  subjectId: string
}

/**
 * Staff → Results.
 *
 * Every row is one student's mark in **one subject this teacher teaches**, in a
 * section they teach it in. It is not a whole result: a Biology teacher sees
 * Biology marks, not the student's Chemistry mark and not their overall
 * outcome, neither of which is any of their business.
 *
 * Read-only. There is no edit, publish or correct control anywhere on this
 * screen, and it calls no mutating endpoint. Filtering and paging happen on the
 * server, and every filter can only narrow what the teacher may already see.
 */
export function TeacherResults({
  rows,
  options,
  page,
  pageSize,
  total,
  totalPages,
  filters,
}: {
  rows: TeacherResultRow[]
  options: TeacherResultOptions
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: TeacherResultFilters
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [searchText, setSearchText] = React.useState(filters.search)

  // Derived, not stored in an effect: the box shows what the server was asked
  // for until the person types something different.
  const [lastSearch, setLastSearch] = React.useState(filters.search)
  if (filters.search !== lastSearch) {
    setLastSearch(filters.search)
    setSearchText(filters.search)
  }

  const applyFilters = React.useCallback(
    (changes: Partial<TeacherResultFilters> & { page?: number }) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1
      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() =>
        router.push(query ? `/staff/results?${query}` : '/staff/results'),
      )
    },
    [filters, page, router],
  )

  const hasFilter = Object.values(filters).some((value) => value !== '')

  // Nothing to show at all is different from nothing matching a filter.
  if (options.sections.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={GraduationCap}
          title="No published results available for your assigned subjects and sections"
          description="Results appear here once the office publishes them for a section you teach. If you think one is missing, ask the office to check your teaching assignments."
        />
      </Card>
    )
  }

  return (
    <>
      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="sr-only" htmlFor="f-exam">
            Exam
          </label>
          <Select
            id="f-exam"
            value={filters.examId}
            onChange={(e) => applyFilters({ examId: e.target.value })}
          >
            <option value="">All exams</option>
            {options.exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
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
            <option value="">All my subjects</option>
            {options.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
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
            <option value="">All my sections</option>
            {options.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-class">
            Class
          </label>
          <Select
            id="f-class"
            value={filters.classId}
            onChange={(e) => applyFilters({ classId: e.target.value, sectionId: '' })}
          >
            <option value="">All classes</option>
            {options.classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-program">
            Programme
          </label>
          <Select
            id="f-program"
            value={filters.programId}
            onChange={(e) => applyFilters({ programId: e.target.value, sectionId: '' })}
          >
            <option value="">All programmes</option>
            {options.programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </Select>

          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault()
              applyFilters({ search: searchText.trim() })
            }}
          >
            <label className="sr-only" htmlFor="f-search">
              Search students
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
              aria-hidden
            />
            <Input
              id="f-search"
              className="pl-9"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name or roll number…"
            />
          </form>
        </div>

        {hasFilter ? (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('')
                applyFilters({
                  search: '',
                  examId: '',
                  classId: '',
                  programId: '',
                  sectionId: '',
                  subjectId: '',
                })
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {rows.length === 0 ? (
          <EmptyState
            icon={hasFilter ? Search : GraduationCap}
            title={
              hasFilter
                ? 'No results match these filters'
                : 'No published results available for your assigned subjects and sections'
            }
            description={
              hasFilter
                ? 'Try a different exam, subject or section.'
                : 'Results appear here once the office publishes them for a section you teach.'
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Student</TH>
                    <TH className="hidden lg:table-cell">Class &amp; section</TH>
                    <TH>Subject</TH>
                    <TH className="text-right">Obtained</TH>
                    <TH className="hidden sm:table-cell text-right">Maximum</TH>
                    <TH className="hidden sm:table-cell text-right">%</TH>
                    <TH className="hidden md:table-cell">Grade</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={`${row.resultId}:${row.subjectId}`}>
                      <TD>
                        <span className="font-medium">{row.studentName}</span>
                        <span className="block text-xs text-foreground-muted">
                          {row.studentCode}
                          {row.rollNumber ? ` · Roll ${row.rollNumber}` : ''}
                        </span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {row.className} · {row.divisionName} · {row.programName} ·{' '}
                        {row.sectionName}
                      </TD>
                      <TD>
                        {row.subjectName}
                        <span className="block text-xs text-foreground-muted lg:hidden">
                          {row.sectionName}
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {row.markStatus === 'PENDING' ? '—' : marksLabel(row.obtainedMarks)}
                      </TD>
                      <TD className="hidden sm:table-cell text-right tabular-nums">
                        {marksLabel(row.maxMarks)}
                      </TD>
                      <TD className="hidden sm:table-cell text-right tabular-nums">
                        {percentageLabel(row.percentage)}
                      </TD>
                      <TD className="hidden md:table-cell">{row.grade ?? '—'}</TD>
                      <TD>
                        <SubjectOutcomeBadge outcome={row.subjectOutcome} status={row.markStatus} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={(next) => applyFilters({ page: next })}
              disabled={pending}
            />
          </>
        )}
      </Card>

      <Alert variant="info" className="mt-4">
        You see the subjects you are assigned to teach, in the sections you teach them in. The
        overall result belongs to the office and to the student.
      </Alert>
    </>
  )
}

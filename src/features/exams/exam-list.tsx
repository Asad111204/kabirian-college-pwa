'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EXAM_STATUSES, EXAM_STATUS_LABEL, type ExamStatusValue } from '@/validation/exams'
import { DateRange, DateSheetBadge, ExamStatusBadge } from './shared'
import { ExamFormDialog, type ExamTypeOption, type SessionOption } from './exam-form-dialog'

export interface ExamListRow {
  id: string
  name: string
  examTypeName: string
  sessionName: string
  startDate: string | null
  endDate: string | null
  status: ExamStatusValue
  paperCount: number
  dateSheetPublished: boolean
}

export interface ExamFilters {
  academicSessionId: string
  examTypeId: string
  status: string
  search: string
}

/**
 * Admin → Exams.
 *
 * Filtering and paging happen on the SERVER: every change rewrites the URL and
 * one page of exams comes back, so a college with years of exam history never
 * sends all of it to a phone.
 */
export function ExamList({
  exams,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  sessions,
  examTypes,
  canManage,
}: {
  exams: ExamListRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: ExamFilters
  sessions: SessionOption[]
  examTypes: ExamTypeOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [searchText, setSearchText] = React.useState(filters.search)

  // Derived, not stored in an effect: the box shows what the server was asked
  // for until the person types something different.
  const [lastSearch, setLastSearch] = React.useState(filters.search)
  if (filters.search !== lastSearch) {
    setLastSearch(filters.search)
    setSearchText(filters.search)
  }

  const applyFilters = React.useCallback(
    (changes: Partial<ExamFilters> & { page?: number }) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1

      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() => router.push(query ? `/admin/exams?${query}` : '/admin/exams'))
    },
    [filters, page, router],
  )

  const hasFilter =
    filters.search !== '' || filters.examTypeId !== '' || filters.status !== ''

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: '', label: 'All' },
            ...EXAM_STATUSES.map((s) => ({ key: s, label: EXAM_STATUS_LABEL[s] })),
          ].map((tab) => {
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
          })}
        </div>

        {canManage && examTypes.length > 0 ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Create exam
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
            onChange={(e) => applyFilters({ academicSessionId: e.target.value })}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
                {session.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="f-type">
            Exam type
          </label>
          <Select
            id="f-type"
            value={filters.examTypeId}
            onChange={(e) => applyFilters({ examTypeId: e.target.value })}
          >
            <option value="">All exam types</option>
            {examTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>

          <form
            className="relative sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault()
              applyFilters({ search: searchText.trim() })
            }}
          >
            <label className="sr-only" htmlFor="f-search">
              Search exams
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
              placeholder="Search by exam name…"
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
                applyFilters({ search: '', examTypeId: '', status: '' })
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {exams.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilter ? 'No exams match these filters' : 'No exams yet'}
            description={
              hasFilter
                ? 'Try a different session, type or status.'
                : examTypes.length === 0
                  ? 'Add an exam type first, then create your first exam.'
                  : 'Create an exam, add its papers, then publish the date sheet.'
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Exam</TH>
                    <TH className="hidden sm:table-cell">Type</TH>
                    <TH className="hidden lg:table-cell">Session</TH>
                    <TH className="hidden md:table-cell">Dates</TH>
                    <TH>Status</TH>
                    <TH className="hidden sm:table-cell">Papers</TH>
                    <TH>Date sheet</TH>
                  </TR>
                </THead>
                <TBody>
                  {exams.map((exam) => (
                    <TR key={exam.id}>
                      <TD>
                        <Link
                          href={`/admin/exams/${exam.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {exam.name}
                        </Link>
                        <p className="text-xs text-foreground-muted sm:hidden">
                          {exam.examTypeName} · {exam.sessionName}
                        </p>
                      </TD>
                      <TD className="hidden sm:table-cell">{exam.examTypeName}</TD>
                      <TD className="hidden lg:table-cell">{exam.sessionName}</TD>
                      <TD className="hidden md:table-cell whitespace-nowrap">
                        <DateRange from={exam.startDate} to={exam.endDate} />
                      </TD>
                      <TD>
                        <ExamStatusBadge status={exam.status} />
                      </TD>
                      <TD className="hidden sm:table-cell">{exam.paperCount}</TD>
                      <TD>
                        <DateSheetBadge published={exam.dateSheetPublished} />
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

      <ExamFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        examTypes={examTypes}
        sessions={sessions}
        onSaved={(id) => router.push(`/admin/exams/${id}`)}
      />
    </>
  )
}

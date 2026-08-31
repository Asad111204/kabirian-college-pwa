'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { ScopedStudent } from '@/server/services/staff-portal.service'

/**
 * The teacher's class list.
 *
 * The columns here are the whole story: this component receives nothing else,
 * because the server never sends more. Filtering by section is offered only for
 * the sections the teacher actually holds.
 */
export function MyStudentsView({
  students,
  sections,
  total,
  page,
  pageSize,
  totalPages,
  filters,
}: {
  students: ScopedStudent[]
  sections: { id: string; label: string; studentCount: number }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  filters: { search: string; sectionId: string }
}) {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState(filters.search)
  const [pending, startTransition] = React.useTransition()

  const apply = React.useCallback(
    (changes: Record<string, string | number | undefined>) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1

      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }

      const query = next.toString()
      startTransition(() => router.push(query ? `/staff/students?${query}` : '/staff/students'))
    },
    [filters, page, router],
  )

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            apply({ search: searchInput })
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, student ID or roll number…"
            className="pl-9"
            aria-label="Search my students"
          />
        </form>

        <Select
          value={filters.sectionId}
          onChange={(e) => apply({ sectionId: e.target.value })}
          aria-label="Filter by section"
          className="w-auto"
        >
          <option value="">All my sections ({total})</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label} ({section.studentCount})
            </option>
          ))}
        </Select>

        {filters.search || filters.sectionId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              apply({ search: '', sectionId: '' })
            }}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filters.search ? `No students match "${filters.search}"` : 'No students here'}
          description={
            filters.search
              ? 'Try a different search term.'
              : 'There are no enrolled students in this section yet.'
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Roll</TH>
                <TH>Student</TH>
                <TH className="hidden sm:table-cell">Student ID</TH>
                <TH>Class</TH>
                <TH className="hidden lg:table-cell">Program</TH>
                <TH>Section</TH>
              </TR>
            </THead>
            <TBody>
              {students.map((student) => (
                <TR key={student.id} className={pending ? 'opacity-60' : undefined}>
                  <TD className="tabular-nums">{student.rollNumber ?? '—'}</TD>
                  <TD>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{student.fullName}</p>
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
                  <TD className="text-sm">
                    {student.className}
                    <span className="block text-xs text-foreground-muted">{student.divisionName}</span>
                  </TD>
                  <TD className="hidden lg:table-cell text-sm text-foreground-muted">
                    {student.programName}
                  </TD>
                  <TD className="text-sm">{student.sectionName}</TD>
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
        onPageChange={(next) => apply({ page: next })}
      />
    </Card>
  )
}

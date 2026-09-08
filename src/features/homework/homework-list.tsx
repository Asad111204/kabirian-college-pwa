'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Paperclip, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { HomeworkOptions, HomeworkRow } from '@/server/services/homework.service'
import { HomeworkEditorDialog } from './homework-editor-dialog'
import { DueBadge, placementLabel } from './shared'

export interface HomeworkFilters {
  search: string
  includePast: boolean
}

/**
 * The teacher's and the office's list. Filters live in the URL; the server
 * scopes the rows (a teacher sees their sections, the office everything) and
 * says per row whether this person may change it.
 */
export function HomeworkList({
  items,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  options,
  basePath,
  canCreate,
}: {
  items: HomeworkRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: HomeworkFilters
  options: HomeworkOptions
  /** `/staff/homework` or `/admin/homework` */
  basePath: string
  canCreate: boolean
}) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [search, setSearch] = React.useState(filters.search)

  const navigate = (next: Partial<HomeworkFilters> & { page?: number }) => {
    const merged = { ...filters, ...next }
    const params = new URLSearchParams()
    if (merged.search) params.set('search', merged.search)
    if (merged.includePast) params.set('includePast', 'true')
    if (next.page && next.page > 1) params.set('page', String(next.page))
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ search })
          }}
        >
          <div className="min-w-0 flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title…" aria-label="Search homework" />
          </div>
          <Checkbox label="Include past due dates" checked={filters.includePast} onChange={(e) => navigate({ includePast: e.target.checked })} />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Set homework
            </Button>
          ) : null}
        </form>
      </Card>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={filters.includePast ? 'No homework yet' : 'Nothing due'}
            description={canCreate ? 'Set a piece of homework for one of your sections and it will appear here and on the students’ pages.' : 'Nothing has been set for the sections you can see.'}
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Homework</TH>
                  <TH>Section</TH>
                  <TH className="hidden md:table-cell">Teacher</TH>
                  <TH>Due</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((h) => (
                  <TR key={h.id}>
                    <TD>
                      <Link href={`${basePath}/${h.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {h.title}
                      </Link>
                      <span className="block text-xs text-foreground-muted">
                        {h.subjectName}
                        {h.attachmentCount > 0 ? (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <Paperclip className="h-3 w-3" aria-hidden />
                            {h.attachmentCount}
                          </span>
                        ) : null}
                      </span>
                    </TD>
                    <TD className="text-sm">{placementLabel(h)}</TD>
                    <TD className="hidden text-sm text-foreground-muted md:table-cell">{h.teacherName}</TD>
                    <TD>
                      <DueBadge due={h.due} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} onPageChange={(p) => navigate({ page: p })} />
      </Card>

      <HomeworkEditorDialog open={createOpen} onOpenChange={setCreateOpen} options={options} onSaved={(saved) => router.push(`${basePath}/${saved.id}`)} />
    </>
  )
}

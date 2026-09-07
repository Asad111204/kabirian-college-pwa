'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Megaphone, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { NoticeRow, NoticeTargetOptions } from '@/server/services/notices.service'
import {
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABEL,
  PUBLISH_STATUSES,
  PUBLISH_STATUS_LABEL,
} from '@/validation/notices'
import { NoticeEditorDialog } from './notice-editor-dialog'
import { CategoryBadge, NoticeStatusBadge, PinnedBadge, windowSentence } from './shared'

export interface NoticeFilters {
  status: string
  category: string
  search: string
}

/**
 * Admin → Notices.
 *
 * Filtering and paging happen on the SERVER: every change rewrites the URL and
 * one page comes back. Writing a notice opens the editor; publishing it
 * happens on its own page, deliberately one step away from the form.
 */
export function NoticeList({
  notices,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  options,
  canManage,
}: {
  notices: NoticeRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: NoticeFilters
  options: NoticeTargetOptions
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [searchText, setSearchText] = React.useState(filters.search)
  const [lastSearch, setLastSearch] = React.useState(filters.search)
  if (filters.search !== lastSearch) {
    setLastSearch(filters.search)
    setSearchText(filters.search)
  }

  const applyFilters = React.useCallback(
    (changes: Partial<NoticeFilters> & { page?: number }) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1
      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() => router.push(query ? `/admin/notices?${query}` : '/admin/notices'))
    },
    [filters, page, router],
  )

  const hasFilter = filters.search !== '' || filters.category !== '' || filters.status !== ''

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ key: '', label: 'All' }, ...PUBLISH_STATUSES.map((s) => ({ key: s, label: PUBLISH_STATUS_LABEL[s] }))].map(
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
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Write a notice
          </Button>
        ) : null}
      </div>

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="sr-only" htmlFor="f-category">
            Category
          </label>
          <Select
            id="f-category"
            value={filters.category}
            onChange={(e) => applyFilters({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {NOTICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NOTICE_CATEGORY_LABEL[c]}
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
              Search notices
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
              placeholder="Search by title…"
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
                applyFilters({ search: '', category: '', status: '' })
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {notices.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={hasFilter ? 'No notices match these filters' : 'No notices yet'}
            description={
              hasFilter
                ? 'Try a different status, category or search.'
                : 'Write a notice, choose who it is for, then publish it from its page.'
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Notice</TH>
                    <TH className="hidden md:table-cell">For</TH>
                    <TH className="hidden lg:table-cell">Showing</TH>
                    <TH>Status</TH>
                    <TH className="hidden sm:table-cell">Files</TH>
                  </TR>
                </THead>
                <TBody>
                  {notices.map((notice) => (
                    <TR key={notice.id}>
                      <TD>
                        <Link
                          href={`/admin/notices/${notice.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {notice.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <CategoryBadge category={notice.category} />
                          {notice.isPinned ? <PinnedBadge /> : null}
                        </div>
                        <p className="mt-1 text-xs text-foreground-muted md:hidden">{notice.audienceSummary}</p>
                      </TD>
                      <TD className="hidden md:table-cell">{notice.audienceSummary}</TD>
                      <TD className="hidden text-foreground-muted lg:table-cell">
                        {windowSentence(notice.publishAtLocal, notice.expiresAtLocal)}
                      </TD>
                      <TD>
                        <NoticeStatusBadge status={notice.status} />
                      </TD>
                      <TD className="hidden tabular-nums sm:table-cell">{notice.attachmentCount}</TD>
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

      <NoticeEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        options={options}
        onSaved={(saved) => router.push(`/admin/notices/${saved.id}`)}
      />
    </>
  )
}

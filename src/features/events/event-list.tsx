'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { EventRow } from '@/server/services/events.service'
import { AUDIENCE_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL } from '@/validation/notices'
import { EventStatusBadge, formatCollegeLocal } from '@/features/notices/shared'
import { EventEditorDialog } from './event-editor-dialog'

export interface EventFilters {
  status: string
  search: string
  upcoming: boolean
}

/**
 * Admin → Events. Server-side filtering and paging, like every other list.
 */
export function EventList({
  events,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  canManage,
}: {
  events: EventRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: EventFilters
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
    (changes: Partial<EventFilters> & { page?: number }) => {
      const merged: Record<string, string | number | boolean | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1
      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '' || value === false) continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() => router.push(query ? `/admin/events?${query}` : '/admin/events'))
    },
    [filters, page, router],
  )

  const hasFilter = filters.search !== '' || filters.status !== '' || filters.upcoming

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ key: '', label: 'All' }, ...EVENT_STATUSES.map((s) => ({ key: s, label: EVENT_STATUS_LABEL[s] }))].map(
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
            Create event
          </Button>
        ) : null}
      </div>

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="flex items-center">
            <Checkbox
              checked={filters.upcoming}
              onChange={(e) => applyFilters({ upcoming: e.target.checked })}
              label="Upcoming only"
            />
          </div>
          <form
            className="relative sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault()
              applyFilters({ search: searchText.trim() })
            }}
          >
            <label className="sr-only" htmlFor="f-search">
              Search events
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
                applyFilters({ search: '', status: '', upcoming: false })
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={hasFilter ? 'No events match these filters' : 'No events yet'}
            description={hasFilter ? 'Try a different status or search.' : 'Create an event, add a picture, then publish it.'}
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Event</TH>
                    <TH className="hidden md:table-cell">When</TH>
                    <TH className="hidden lg:table-cell">Where</TH>
                    <TH className="hidden sm:table-cell">For</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {events.map((event) => (
                    <TR key={event.id}>
                      <TD>
                        <Link href={`/admin/events/${event.id}`} className="font-medium text-primary hover:underline">
                          {event.title}
                        </Link>
                        <p className="text-xs text-foreground-muted md:hidden">{formatCollegeLocal(event.startsAtLocal)}</p>
                      </TD>
                      <TD className="hidden md:table-cell">
                        {formatCollegeLocal(event.startsAtLocal)}
                        {event.endsAtLocal ? ` – ${formatCollegeLocal(event.endsAtLocal)}` : ''}
                      </TD>
                      <TD className="hidden lg:table-cell">{event.location ?? '—'}</TD>
                      <TD className="hidden sm:table-cell">{AUDIENCE_LABEL[event.audience]}</TD>
                      <TD>
                        <EventStatusBadge status={event.status} />
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

      <EventEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(saved) => router.push(`/admin/events/${saved.id}`)}
      />
    </>
  )
}

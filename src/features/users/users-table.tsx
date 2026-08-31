'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, KeyRound, Plus, Search, Settings2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { AccountStatusBadge, RoleBadge } from './shared'
import { CreateUserDialog } from './create-user-dialog'
import type { UserRole, UserStatus } from '@/generated/prisma/enums'

export interface UserRow {
  id: string
  username: string
  displayName: string
  email: string | null
  role: UserRole
  status: UserStatus
  isLocked: boolean
  mustChangePassword: boolean
  isSystemOwner: boolean
  lastLoginAt: string | null
  createdAt: string
  profile: { type: 'STAFF' | 'STUDENT'; id: string; name: string; code: string } | null
}

export interface UsersTableProps {
  users: UserRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counts: Record<string, number>
  filters: { search: string; role: string; status: string; sort: string; direction: string }
}

/**
 * The user list.
 *
 * Search, filtering, sorting and paging all happen on the SERVER: changing any
 * of them updates the URL, and the page re-renders with one page of results.
 * The browser never receives the whole user table.
 */
export function UsersTable({
  users,
  page,
  pageSize,
  total,
  totalPages,
  counts,
  filters,
}: UsersTableProps) {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState(filters.search)
  const [createOpen, setCreateOpen] = React.useState(false)
  // React tracks the navigation for us, so the table can dim while the next
  // page of results is being fetched — no manual "loading" flag to reset.
  const [pending, startTransition] = React.useTransition()

  const applyFilters = React.useCallback(
    (changes: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams()
      const merged = { ...filters, page, ...changes }

      // Any filter change returns to page 1 — page 5 of the old result set is
      // meaningless once the filter changed.
      if (!('page' in changes)) merged.page = 1

      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '' || value === 'ALL') continue
        if (key === 'page' && value === 1) continue
        if (key === 'sort' && value === 'createdAt') continue
        if (key === 'direction' && value === 'desc') continue
        next.set(key, String(value))
      }

      const query = next.toString()
      startTransition(() => {
        router.push(query ? `/admin/users?${query}` : '/admin/users')
      })
    },
    [filters, page, router],
  )

  function toggleSort(column: string) {
    const direction = filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc'
    applyFilters({ sort: column, direction })
  }

  return (
    <>
      {/* Quick role filters, with live counts */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: 'ALL', label: 'All users', count: counts.all },
          { key: 'ADMIN', label: 'Administrators', count: counts.admin },
          { key: 'STAFF', label: 'Staff', count: counts.staff },
          { key: 'STUDENT', label: 'Students', count: counts.student },
        ].map((tab) => {
          const active = filters.role === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => applyFilters({ role: tab.key })}
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
                {tab.count ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <Card>
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
              placeholder="Search by name or username…"
              className="pl-9"
              aria-label="Search users"
            />
          </form>

          <Select
            value={filters.status}
            onChange={(e) => applyFilters({ status: e.target.value })}
            aria-label="Filter by status"
            className="w-auto"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="LOCKED">Locked ({counts.locked ?? 0})</option>
          </Select>

          <Button size="sm" onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        </div>

        {users.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={filters.search ? `No users match "${filters.search}"` : 'No user accounts yet'}
            description={
              filters.search
                ? 'Try a different search term, or clear the filters.'
                : 'Create accounts so staff and students can sign in.'
            }
            action={
              filters.search ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('')
                    applyFilters({ search: '', role: 'ALL', status: 'ALL' })
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add user
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
                    <SortButton
                      label="Name"
                      column="username"
                      sort={filters.sort}
                      direction={filters.direction}
                      onSort={toggleSort}
                    />
                  </TH>
                  <TH>
                    <SortButton
                      label="Role"
                      column="role"
                      sort={filters.sort}
                      direction={filters.direction}
                      onSort={toggleSort}
                    />
                  </TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Linked record</TH>
                  <TH className="hidden lg:table-cell">
                    <SortButton
                      label="Last login"
                      column="lastLoginAt"
                      sort={filters.sort}
                      direction={filters.direction}
                      onSort={toggleSort}
                    />
                  </TH>
                  <TH className="hidden xl:table-cell">
                    <SortButton
                      label="Created"
                      column="createdAt"
                      sort={filters.sort}
                      direction={filters.direction}
                      onSort={toggleSort}
                    />
                  </TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>

              <TBody>
                {users.map((user) => (
                  <TR key={user.id} className={pending ? 'opacity-60' : undefined}>
                    <TD>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="truncate font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {user.displayName}
                          </Link>
                          {user.isSystemOwner ? <Badge variant="brand">Owner</Badge> : null}
                        </div>
                        <p className="truncate font-mono text-xs text-foreground-muted">
                          {user.username}
                        </p>
                        {/* On narrow screens the hidden columns matter most as a summary. */}
                        <p className="mt-0.5 text-xs text-foreground-muted md:hidden">
                          {user.profile
                            ? `${user.profile.code} · ${user.profile.name}`
                            : 'No linked record'}
                        </p>
                      </div>
                    </TD>

                    <TD>
                      <RoleBadge role={user.role} />
                    </TD>

                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <AccountStatusBadge status={user.status} isLocked={user.isLocked} />
                        {user.mustChangePassword ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-warning-700">
                            <KeyRound className="h-3 w-3" />
                            Temporary password
                          </span>
                        ) : null}
                      </div>
                    </TD>

                    <TD className="hidden md:table-cell">
                      {user.profile ? (
                        <div className="text-sm">
                          <p className="text-foreground">{user.profile.name}</p>
                          <code className="text-xs text-foreground-muted">{user.profile.code}</code>
                        </div>
                      ) : (
                        <span className="text-sm text-foreground-subtle">—</span>
                      )}
                    </TD>

                    <TD className="hidden whitespace-nowrap text-sm text-foreground-muted lg:table-cell">
                      {formatDateTime(user.lastLoginAt)}
                    </TD>

                    <TD className="hidden whitespace-nowrap text-sm text-foreground-muted xl:table-cell">
                      {formatDateTime(user.createdAt)}
                    </TD>

                    <TD>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/users/${user.id}`}>
                            <Settings2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Manage</span>
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

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function SortButton({
  label,
  column,
  sort,
  direction,
  onSort,
}: {
  label: string
  column: string
  sort: string
  direction: string
  onSort: (column: string) => void
}) {
  const active = sort === column
  return (
    <button
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
      {active ? <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span> : null}
    </button>
  )
}

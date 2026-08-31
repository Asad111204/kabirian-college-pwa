'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Plus, Search, Settings2, UserCog, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_STATUSES, STAFF_TYPE_LABEL, STAFF_TYPES } from '@/validation/staff'

export interface StaffRow {
  id: string
  staffCode: string
  fullName: string
  designation: string
  department: string | null
  staffType: string
  employmentStatus: string
  phone: string | null
  joiningDate: string
  account: { username: string; isActive: boolean } | null
  activeAssignmentCount: number
  inchargeCount: number
}

export interface StaffFilters {
  search: string
  departmentId: string
  designationId: string
  staffType: string
  status: string
  account: string
  sort: string
  direction: string
}

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  INACTIVE: 'neutral',
  RESIGNED: 'danger',
  RETIRED: 'info',
  TERMINATED: 'danger',
  LEFT: 'neutral',
}

/**
 * The staff list. Search, filters, sorting and paging all run on the server, so
 * a college with hundreds of staff sends one page to the browser at a time.
 */
export function StaffTable({
  staff,
  page,
  pageSize,
  total,
  totalPages,
  counts,
  filters,
  departments,
  designations,
}: {
  staff: StaffRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counts: Record<string, number>
  filters: StaffFilters
  departments: { id: string; name: string }[]
  designations: { id: string; name: string }[]
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
      startTransition(() => router.push(query ? `/admin/staff?${query}` : '/admin/staff'))
    },
    [filters, page, router],
  )

  function toggleSort(column: string) {
    const direction = filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc'
    applyFilters({ sort: column, direction })
  }

  const hasFilters = Boolean(
    filters.search || filters.departmentId || filters.designationId || filters.staffType !== 'ALL' || filters.account !== 'ALL',
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ key: 'ALL', label: 'All' }, ...EMPLOYMENT_STATUSES.map((s) => ({ key: s, label: EMPLOYMENT_STATUS_LABEL[s]! }))].map(
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
              placeholder="Search by name, staff ID or contact number…"
              className="pl-9"
              aria-label="Search staff"
            />
          </form>

          <Button size="sm" asChild className="shrink-0">
            <Link href="/admin/staff/new">
              <Plus className="h-4 w-4" />
              Add staff
            </Link>
          </Button>
        </div>

        <div className="grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={filters.departmentId}
            onChange={(e) => applyFilters({ departmentId: e.target.value })}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.designationId}
            onChange={(e) => applyFilters({ designationId: e.target.value })}
            aria-label="Filter by designation"
          >
            <option value="">All designations</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.staffType}
            onChange={(e) => applyFilters({ staffType: e.target.value })}
            aria-label="Filter by staff type"
          >
            <option value="ALL">All staff types</option>
            {STAFF_TYPES.map((t) => (
              <option key={t} value={t}>
                {STAFF_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>

          <Select
            value={filters.account}
            onChange={(e) => applyFilters({ account: e.target.value })}
            aria-label="Filter by account status"
          >
            <option value="ALL">Any account status</option>
            <option value="LINKED">Has a portal account</option>
            <option value="NONE">No portal account</option>
          </Select>
        </div>

        {hasFilters ? (
          <div className="border-b border-border px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('')
                applyFilters({ search: '', departmentId: '', designationId: '', staffType: 'ALL', account: 'ALL' })
              }}
            >
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          </div>
        ) : null}

        {staff.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={hasFilters ? 'No staff match these filters' : 'No staff yet'}
            description={
              hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Add your teachers and other staff members to get started.'
            }
            action={
              hasFilters ? null : (
                <Button size="sm" asChild>
                  <Link href="/admin/staff/new">
                    <Plus className="h-4 w-4" />
                    Add staff
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
                    <SortButton label="Name" column="fullName" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH className="hidden sm:table-cell">
                    <SortButton label="Staff ID" column="staffCode" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH>Designation</TH>
                  <TH className="hidden lg:table-cell">Department</TH>
                  <TH className="hidden xl:table-cell">Contact</TH>
                  <TH className="hidden lg:table-cell">
                    <SortButton label="Joined" column="joiningDate" filters={filters} onSort={toggleSort} />
                  </TH>
                  <TH>Assignments</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>

              <TBody>
                {staff.map((member) => (
                  <TR key={member.id} className={pending ? 'opacity-60' : undefined}>
                    <TD>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/staff/${member.id}`}
                          className="truncate font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {member.fullName}
                        </Link>
                        <p className="truncate font-mono text-xs text-foreground-subtle sm:hidden">
                          {member.staffCode}
                        </p>
                        {member.account ? (
                          <p className="truncate text-xs text-foreground-muted">
                            {member.account.username}
                          </p>
                        ) : (
                          <p className="text-xs text-foreground-subtle">No portal account</p>
                        )}
                      </div>
                    </TD>

                    <TD className="hidden sm:table-cell">
                      <code className="text-xs">{member.staffCode}</code>
                    </TD>

                    <TD>
                      <div className="text-sm">
                        <p className="text-foreground">{member.designation}</p>
                        <p className="text-xs text-foreground-muted">
                          {STAFF_TYPE_LABEL[member.staffType] ?? member.staffType}
                        </p>
                      </div>
                    </TD>

                    <TD className="hidden lg:table-cell text-sm text-foreground-muted">
                      {member.department ?? '—'}
                    </TD>

                    <TD className="hidden xl:table-cell text-sm text-foreground-muted">
                      {member.phone ?? '—'}
                    </TD>

                    <TD className="hidden lg:table-cell whitespace-nowrap text-sm text-foreground-muted">
                      {formatDate(member.joiningDate)}
                    </TD>

                    <TD>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-sm tabular-nums">
                          {member.activeAssignmentCount} subject
                          {member.activeAssignmentCount === 1 ? '' : 's'}
                        </span>
                        {member.inchargeCount > 0 ? (
                          <Badge variant="brand">
                            In-charge ×{member.inchargeCount}
                          </Badge>
                        ) : null}
                      </div>
                    </TD>

                    <TD>
                      <Badge variant={STATUS_VARIANT[member.employmentStatus] ?? 'neutral'}>
                        {EMPLOYMENT_STATUS_LABEL[member.employmentStatus] ?? member.employmentStatus}
                      </Badge>
                    </TD>

                    <TD>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/staff/${member.id}`}>
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
  filters: StaffFilters
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

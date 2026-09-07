'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, History, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { AuditEntryDetail, AuditFilterOptions, AuditListItem } from '@/server/services/audit.service'

/** The list item as it crosses to the browser: dates as ISO strings. */
export type AuditRow = Omit<AuditListItem, 'createdAt'> & { createdAt: string }
type AuditDetail = Omit<AuditEntryDetail, 'createdAt'> & { createdAt: string }

export interface AuditFilters {
  actor: string
  module: string
  action: string
  entityType: string
  dateFrom: string
  dateTo: string
  includeSignIns: boolean
}

const TONE_DOT = {
  neutral: 'bg-ink-400',
  positive: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
} as const

/** Where a record type's page lives, when it has one. */
const RECORD_PAGES: Record<string, string> = {
  user: '/admin/users',
  student: '/admin/students',
  staff: '/admin/staff',
  notice: '/admin/notices',
  event: '/admin/events',
  exam: '/admin/exams',
}

export function recordHref(entityType: string, entityId: string | null): string | null {
  const base = RECORD_PAGES[entityType]
  return base && entityId ? `${base}/${entityId}` : null
}

/** The query string the page loaded with — also the CSV link, plus `format=csv`. */
export function auditQueryString(filters: AuditFilters, page?: number): string {
  const params = new URLSearchParams()
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.module) params.set('module', filters.module)
  if (filters.action) params.set('action', filters.action)
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.includeSignIns) params.set('includeSignIns', 'true')
  if (page && page > 1) params.set('page', String(page))
  return params.toString()
}

const EMPTY_FILTERS: AuditFilters = { actor: '', module: '', action: '', entityType: '', dateFrom: '', dateTo: '', includeSignIns: false }

/**
 * Admin → Audit Log.
 *
 * The server has already authorised the viewer and loaded one page; this
 * component owns the filters (which live in the URL, so a filtered view can
 * be bookmarked or shared with another administrator) and the detail dialog,
 * which asks the API for one entry's redacted change list on demand.
 */
export function AuditViewer({
  items,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  options,
}: {
  items: AuditRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: AuditFilters
  options: AuditFilterOptions
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<AuditFilters>(filters)
  const [openId, setOpenId] = React.useState<string | null>(null)

  const navigate = (next: AuditFilters, nextPage = 1) => {
    const qs = auditQueryString(next, nextPage)
    router.push(qs ? `/admin/audit?${qs}` : '/admin/audit')
  }

  const actionsForModule = draft.module ? options.actions.filter((a) => a.module === draft.module) : options.actions
  const hasFilters = auditQueryString(filters) !== ''
  const csvHref = `/api/v1/audit?${auditQueryString(filters)}${auditQueryString(filters) ? '&' : ''}format=csv`

  return (
    <>
      <Card className="mb-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            navigate(draft)
          }}
        >
          <Field label="Who" htmlFor="audit-actor" hint="Username or name">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-foreground-subtle" aria-hidden />
              <Input
                id="audit-actor"
                className="pl-8"
                value={draft.actor}
                onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
                placeholder="e.g. admin"
              />
            </div>
          </Field>
          <Field label="Module" htmlFor="audit-module">
            <Select id="audit-module" value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value, action: '' })}>
              <option value="">All modules</option>
              {options.modules.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action" htmlFor="audit-action">
            <Select id="audit-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
              <option value="">All actions</option>
              {actionsForModule.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Record type" htmlFor="audit-entity">
            <Select id="audit-entity" value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })}>
              <option value="">All record types</option>
              {options.entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="audit-from">
            <Input id="audit-from" type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
          </Field>
          <Field label="To" htmlFor="audit-to">
            <Input id="audit-to" type="date" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              label="Include sign-ins and sign-outs"
              checked={draft.includeSignIns}
              onChange={(e) => setDraft({ ...draft, includeSignIns: e.target.checked })}
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(EMPTY_FILTERS)
                  navigate(EMPTY_FILTERS)
                }}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm text-foreground-muted">
            {total === 0 ? 'No entries match.' : `${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'}, newest first.`}
          </p>
          <Button variant="secondary" size="sm" asChild>
            <a href={csvHref} download>
              <Download className="h-4 w-4" />
              Download CSV
            </a>
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing recorded for these filters"
            description={hasFilters ? 'Try widening the dates or clearing a filter.' : 'Changes made through the system will appear here.'}
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>Did what</TH>
                  <TH>Record</TH>
                  <TH className="hidden md:table-cell">IP address</TH>
                  <TH className="text-right">
                    <span className="sr-only">Details</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {items.map((item) => {
                  const href = recordHref(item.entityType, item.entityId)
                  return (
                    <TR key={item.id}>
                      <TD className="whitespace-nowrap text-foreground-muted">
                        <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      </TD>
                      <TD>
                        {item.actor ? (
                          <>
                            <span className="font-medium text-foreground">{item.actor.name}</span>
                            <span className="block text-xs text-foreground-subtle">
                              {item.actor.username}
                              {item.actorRole ? ` · ${item.actorRole.toLowerCase()}` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-foreground-muted">System</span>
                        )}
                      </TD>
                      <TD>
                        <span className="flex items-start gap-2">
                          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[item.tone])} aria-hidden />
                          <span>
                            {item.description}
                            <span className="block font-mono text-[11px] text-foreground-subtle">{item.action}</span>
                          </span>
                        </span>
                      </TD>
                      <TD>
                        {item.entityLabel ? (
                          href ? (
                            <Link href={href} className="text-primary hover:underline">
                              {item.entityLabel}
                            </Link>
                          ) : (
                            item.entityLabel
                          )
                        ) : (
                          <span className="text-foreground-subtle">—</span>
                        )}
                        <span className="block text-xs text-foreground-subtle">{item.entityType.replace(/_/g, ' ')}</span>
                      </TD>
                      <TD className="hidden font-mono text-xs text-foreground-muted md:table-cell">{item.ipAddress ?? '—'}</TD>
                      <TD className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setOpenId(item.id)}>
                          Details
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}

        <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} onPageChange={(p) => navigate(filters, p)} />
      </Card>

      <AuditDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Detail dialog                                                              */
/* -------------------------------------------------------------------------- */

function AuditDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [loaded, setLoaded] = React.useState<{ id: string; detail: AuditDetail | null; error: string | null }>({ id: '', detail: null, error: null })

  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get<AuditDetail>(`/api/v1/audit/${id}`)
      .then((detail) => {
        if (!cancelled) setLoaded({ id, detail, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ id, detail: null, error: error instanceof ApiError ? error.message : 'The entry could not be loaded.' })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const ready = id !== null && loaded.id === id
  const detail = ready ? loaded.detail : null

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={detail ? `${detail.actor?.name ?? 'System'} ${detail.description}${detail.entityLabel ? ` ${detail.entityLabel}` : ''}` : 'Audit entry'}
        description={detail ? formatDateTime(detail.createdAt) : undefined}
        className="max-w-2xl"
      >
        {!ready ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : loaded.error ? (
          <Alert variant="danger">{loaded.error}</Alert>
        ) : detail ? (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <DetailRow label="Action" value={<span className="font-mono text-xs">{detail.action}</span>} />
              <DetailRow label="Role" value={detail.actorRole ? <Badge variant="neutral">{detail.actorRole}</Badge> : '—'} />
              <DetailRow label="Signed in as" value={detail.actor?.username ?? 'System'} />
              <DetailRow label="IP address" value={<span className="font-mono text-xs">{detail.ipAddress ?? '—'}</span>} />
              <DetailRow label="Browser" value={<span className="break-all text-xs">{detail.userAgent ?? '—'}</span>} />
              <DetailRow label="Record type" value={detail.entityType.replace(/_/g, ' ')} />
            </dl>

            {detail.changes.length > 0 ? (
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Field</TH>
                      <TH>Before</TH>
                      <TH>After</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {detail.changes.map((c) => (
                      <TR key={c.field}>
                        <TD className="font-medium">{c.field}</TD>
                        <TD className="text-foreground-muted">{c.before ?? <span className="text-foreground-subtle">—</span>}</TD>
                        <TD>{c.after ?? <span className="text-foreground-subtle">—</span>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            ) : null}

            {detail.facts.length > 0 ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {detail.facts.map((f) => (
                  <DetailRow key={f.field} label={f.field} value={f.value} />
                ))}
              </dl>
            ) : null}

            {detail.hasHiddenDetail ? (
              <Alert variant="info">Only internal references were recorded for this entry, so there is nothing more to show.</Alert>
            ) : detail.changes.length === 0 && detail.facts.length === 0 ? (
              <p className="text-sm text-foreground-muted">No field changes were recorded for this entry.</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-foreground">{value}</dd>
    </div>
  )
}

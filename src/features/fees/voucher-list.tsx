'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarRange, Receipt, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OnlineOnlyButton } from '@/components/pwa/online-only-button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { formatPaisa } from '@/lib/money'
import { FEE_VOUCHER_STATUSES, FEE_VOUCHER_STATUS_LABEL, FEE_VOUCHER_STATUS_TONE } from '@/server/fees/fees-policy'
import type { FeeSessionSummary, FeeVoucherRow, VoucherRunResult } from '@/server/services/fees.service'
import type { PaginatedResult } from '@/server/services/service-utils'

/**
 * Admin → Fees. One academic year's vouchers, what they came to, and the
 * button that issues them.
 *
 * The run always offers a dry run first: a bill run for four hundred families
 * is not something anybody should press blind.
 */
export function VoucherListScreen({
  page,
  summary,
  sessions,
  canManage,
}: {
  page: PaginatedResult<FeeVoucherRow>
  summary: FeeSessionSummary
  sessions: { id: string; name: string }[]
  canManage: boolean
}) {
  const router = useRouter()
  const [running, setRunning] = React.useState(false)

  const go = (params: Record<string, string>) => {
    const search = new URLSearchParams({ academicSessionId: summary.academicSessionId })
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value)
      else search.delete(key)
    }
    router.push(`/admin/fees?${search.toString()}`)
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 pb-2 text-sm text-foreground-muted">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Year
          </div>
          <Select
            value={summary.academicSessionId}
            aria-label="Academic session"
            onChange={(e) => router.push(`/admin/fees?academicSessionId=${e.target.value}`)}
            className="w-auto max-w-full"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </Select>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" aria-hidden />
            <Input
              defaultValue=""
              placeholder="Search by voucher number or student…"
              aria-label="Search vouchers"
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter') go({ search: (e.target as HTMLInputElement).value })
              }}
            />
          </div>
          <Select defaultValue="" aria-label="Filter by state" onChange={(e) => go({ status: e.target.value })} className="w-auto max-w-full">
            <option value="">Any state</option>
            {FEE_VOUCHER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {FEE_VOUCHER_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" size="sm" onClick={() => go({ owingOnly: 'true' })}>
            Still owing
          </Button>
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setRunning(true)}>
              <Receipt className="h-4 w-4" aria-hidden />
              Issue vouchers
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ['Vouchers', String(summary.vouchers)],
            ['Charged', formatPaisa(summary.billedPaisa)],
            ['Collected', formatPaisa(summary.collectedPaisa)],
            ['Still owed', formatPaisa(summary.outstandingPaisa)],
            ['Overdue', String(summary.overdueVouchers)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-foreground-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-foreground-subtle">{summary.academicSessionName}</p>
      </Card>

      {page.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="No vouchers for this year"
            description={canManage ? "Set each student's fee on their record, then issue the year's vouchers with the button above." : 'Nothing has been issued for this year.'}
          />
        </Card>
      ) : (
        <Card>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Voucher</TH>
                  <TH>Student</TH>
                  <TH className="text-right">Charged</TH>
                  <TH className="text-right">Collected</TH>
                  <TH className="text-right">Remaining</TH>
                  <TH>State</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link href={`/admin/fees/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.voucherNumber}
                      </Link>
                      <span className="block text-xs text-foreground-muted">
                        {row.academicSessionName}
                        {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ''}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-foreground">{row.studentName}</span>
                      <span className="block text-xs text-foreground-muted">{row.studentCode}</span>
                    </TD>
                    <TD className="text-right tabular-nums">{formatPaisa(row.netPayablePaisa)}</TD>
                    <TD className="text-right tabular-nums">{formatPaisa(row.paidPaisa)}</TD>
                    <TD className="text-right font-medium tabular-nums">{formatPaisa(row.outstandingPaisa)}</TD>
                    <TD>
                      <Badge variant={FEE_VOUCHER_STATUS_TONE[row.status]}>{FEE_VOUCHER_STATUS_LABEL[row.status]}</Badge>
                      {row.overdue ? <span className="block text-xs font-medium text-danger-600">Overdue</span> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </Card>
      )}

      {page.total > page.pageSize ? (
        <div className="mt-4">
          <Pagination page={page.page} pageSize={page.pageSize} total={page.total} totalPages={page.totalPages} onPageChange={(next) => go({ page: String(next) })} />
        </div>
      ) : null}

      <RunDialog
        open={running}
        academicSessionId={summary.academicSessionId}
        sessionName={summary.academicSessionName}
        onOpenChange={setRunning}
        onIssued={() => router.refresh()}
      />
    </>
  )
}

function RunDialog({
  open,
  academicSessionId,
  sessionName,
  onOpenChange,
  onIssued,
}: {
  open: boolean
  academicSessionId: string
  sessionName: string
  onOpenChange: (open: boolean) => void
  onIssued: () => void
}) {
  const [preview, setPreview] = React.useState<VoucherRunResult | null>(null)
  const [dueDate, setDueDate] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPreview(null)
      setDueDate('')
      setError(null)
    }
  }

  async function run(dryRun: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<VoucherRunResult>('/api/v1/fees/run', {
        academicSessionId,
        dueDate: dueDate || undefined,
        dryRun,
      })
      setPreview(result)
      if (!dryRun) {
        toast.success(`${result.issued} voucher${result.issued === 1 ? '' : 's'} issued.`)
        onIssued()
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The vouchers could not be issued. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Issue vouchers for ${sessionName}`} description="One voucher per student, for everybody who has a fee set for this year and does not have one yet.">
        <div className="space-y-4">
          <Field
            label="Due date"
            htmlFor="run-due-date"
            hint="Optional. Families pay in instalments, so leave it empty unless the school wants a date on the voucher."
          >
            <Input id="run-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="max-w-[14rem]" />
          </Field>

          {preview ? (
            <Alert variant={preview.dryRun ? 'info' : 'success'} title={preview.dryRun ? 'What this would do' : 'Issued'}>
              <ul className="mt-1 space-y-0.5 text-sm">
                <li>
                  {preview.issued} voucher{preview.issued === 1 ? '' : 's'} {preview.dryRun ? 'would be issued' : 'issued'}, {formatPaisa(preview.totalBilledPaisa)} in
                  total{preview.dueDate ? `, due ${formatDate(preview.dueDate)}` : ''}.
                </li>
                {preview.skippedExisting > 0 ? <li>{preview.skippedExisting} already had one for this year.</li> : null}
                {preview.skippedNoFee > 0 ? <li>{preview.skippedNoFee} have no fee set for this year.</li> : null}
              </ul>
            </Alert>
          ) : (
            <p className="text-sm text-foreground-muted">Check what it would do first. Nothing is written until you issue them.</p>
          )}

          {error ? (
            <Alert variant="danger" title="Not issued">
              {error}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => void run(true)} disabled={busy}>
              Check first
            </Button>
            <OnlineOnlyButton onClick={() => void run(false)} loading={busy} disabled={preview !== null && preview.issued === 0}>
              Issue vouchers
            </OnlineOnlyButton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

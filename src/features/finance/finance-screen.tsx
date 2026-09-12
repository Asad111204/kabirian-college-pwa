'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarRange, Plus, Search, Undo2, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OnlineOnlyButton } from '@/components/pwa/online-only-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatPaisa } from '@/lib/money'
import { FEE_PAYMENT_METHODS, FEE_PAYMENT_METHOD_LABEL } from '@/server/fees/fees-policy'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategoryValue } from '@/server/finance/finance-policy'
import type { ExpenseView, FinanceSummary } from '@/server/services/finance.service'
import type { PaginatedResult } from '@/server/services/service-utils'
import { MoneyChart } from './money-chart'

/**
 * Admin → Finance. What came in, what went out, what is still owed, and a
 * year of it drawn month by month.
 */
export function FinanceScreen({
  summary,
  expenses,
  today,
  canManage,
}: {
  summary: FinanceSummary
  expenses: PaginatedResult<ExpenseView>
  today: string
  canManage: boolean
}) {
  const router = useRouter()
  const [recording, setRecording] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const go = (params: Record<string, string>) => {
    const search = new URLSearchParams({ month: summary.month })
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value)
      else search.delete(key)
    }
    router.push(`/admin/finance?${search.toString()}`)
  }

  async function run(what: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      await what()
      toast.success(done)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 pb-2 text-sm text-foreground-muted">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Month
          </div>
          <Input
            type="month"
            value={summary.month.slice(0, 7)}
            onChange={(e) => router.push(e.target.value ? `/admin/finance?month=${e.target.value}-01` : '/admin/finance')}
            aria-label="Month"
            className="max-w-[12rem]"
          />
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setRecording(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Record an expense
            </Button>
          ) : null}
          <Link href="/admin/fees" className="pb-2 text-sm text-primary hover:underline">
            Fee vouchers →
          </Link>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ['Collected', formatPaisa(summary.collectedPaisa), ''],
            ['Spent', formatPaisa(summary.spentPaisa), ''],
            ['Left over', formatPaisa(summary.netPaisa), summary.netPaisa < 0 ? 'text-danger-600' : 'text-success-700'],
            ['Billed', formatPaisa(summary.billedPaisa), ''],
            ['Still owed', formatPaisa(summary.outstandingPaisa), summary.outstandingPaisa > 0 ? 'text-danger-600' : ''],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <dt className="text-xs text-foreground-muted">{label}</dt>
              <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-foreground-subtle">
          {summary.monthLabel}
          {summary.overdueVouchers > 0 ? ` · ${summary.overdueVouchers} voucher${summary.overdueVouchers === 1 ? '' : 's'} overdue` : ''}
        </p>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyChart history={summary.history} />
        </CardContent>
      </Card>

      {summary.byCategory.length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>What {summary.monthLabel} went on</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.byCategory.map((row) => {
                const share = summary.spentPaisa > 0 ? Math.round((row.amountPaisa / summary.spentPaisa) * 100) : 0
                return (
                  <li key={row.category}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-foreground">{row.label}</span>
                      <span className="tabular-nums text-foreground-muted">
                        {formatPaisa(row.amountPaisa)} · {share}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="danger" className="mb-4" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Expenses</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">Never edited: an expense recorded in error is voided, with a reason.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" aria-hidden />
              <Input
                defaultValue=""
                placeholder="Search expenses…"
                aria-label="Search expenses"
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') go({ search: (e.target as HTMLInputElement).value })
                }}
              />
            </div>
            <Select defaultValue="" aria-label="Filter by category" onChange={(e) => go({ category: e.target.value })} className="w-auto max-w-full">
              <option value="">Anything</option>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {EXPENSE_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className={expenses.items.length === 0 ? '' : 'p-0'}>
          {expenses.items.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing recorded for this month" description="Record what the school has spent so the figures above are the whole picture." />
          ) : (
            <ul className="divide-y divide-border">
              {expenses.items.map((expense) => (
                <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={expense.voidedAt ? 'font-medium text-foreground-subtle line-through' : 'font-medium text-foreground'}>
                      {expense.title}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {expense.categoryLabel} · {formatDate(expense.spentOn)} · {FEE_PAYMENT_METHOD_LABEL[expense.method]}
                      {expense.reference ? ` · ${expense.reference}` : ''}
                      {expense.recordedBy ? ` · ${expense.recordedBy}` : ''}
                    </p>
                    {expense.voidedAt ? (
                      <p className="text-xs text-danger-600">
                        Voided {formatDateTime(expense.voidedAt)}
                        {expense.voidReason ? ` · ${expense.voidReason}` : ''}
                      </p>
                    ) : null}
                    {expense.remarks ? <p className="text-xs text-foreground-subtle">{expense.remarks}</p> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={expense.voidedAt ? 'tabular-nums text-foreground-subtle line-through' : 'font-semibold tabular-nums text-foreground'}>
                      {formatPaisa(expense.amountPaisa)}
                    </span>
                    {expense.voidedAt ? (
                      <Badge variant="neutral">Voided</Badge>
                    ) : canManage ? (
                      <VoidExpenseButton
                        busy={busy}
                        onVoid={(reason) => run(() => api.post(`/api/v1/finance/expenses/${expense.id}/void`, { reason }), 'Expense voided.')}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {expenses.total > expenses.pageSize ? (
        <div className="mt-4">
          <Pagination
            page={expenses.page}
            pageSize={expenses.pageSize}
            total={expenses.total}
            totalPages={expenses.totalPages}
            onPageChange={(next) => go({ page: String(next) })}
          />
        </div>
      ) : null}

      <ExpenseDialog
        open={recording}
        today={today}
        onOpenChange={setRecording}
        onRecord={async (body) => {
          await run(() => api.post('/api/v1/finance/expenses', body), 'Expense recorded.')
          setRecording(false)
        }}
      />
    </>
  )
}

function VoidExpenseButton({ busy, onVoid }: { busy: boolean; onVoid: (reason: string) => void | Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={busy}>
        <Undo2 className="h-4 w-4" aria-hidden />
        Void
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Void this expense" description="It is kept and marked voided, and comes out of the month's figures. Say why.">
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              await onVoid(reason)
              setOpen(false)
              setReason('')
            }}
            className="space-y-4"
          >
            <Field label="Reason" htmlFor="void-expense-reason" required>
              <Textarea id="void-expense-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} required />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Back
              </Button>
              <Button type="submit" variant="danger" disabled={reason.trim().length === 0}>
                Void expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ExpenseDialog({
  open,
  today,
  onOpenChange,
  onRecord,
}: {
  open: boolean
  today: string
  onOpenChange: (open: boolean) => void
  onRecord: (body: Record<string, unknown>) => Promise<void>
}) {
  const [category, setCategory] = React.useState<ExpenseCategoryValue>('SALARIES')
  const [title, setTitle] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [spentOn, setSpentOn] = React.useState(today)
  const [method, setMethod] = React.useState<(typeof FEE_PAYMENT_METHODS)[number]>('CASH')
  const [reference, setReference] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCategory('SALARIES')
      setTitle('')
      setAmount('')
      setSpentOn(today)
      setMethod('CASH')
      setReference('')
      setRemarks('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record an expense" description="What the school spent, and when.">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            try {
              await onRecord({
                category,
                title,
                amountPaisa: amount,
                spentOn,
                method,
                reference: reference || undefined,
                remarks: remarks || undefined,
              })
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <Field label="What was it for?" htmlFor="expense-category" required>
            <Select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategoryValue)}>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {EXPENSE_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="expense-title" required>
            <Input id="expense-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required placeholder="September electricity bill" />
          </Field>
          <Field label="Amount (Rs)" htmlFor="expense-amount" required>
            <Input id="expense-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Paid on" htmlFor="expense-date" required>
            <Input id="expense-date" type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} required />
          </Field>
          <Field label="How" htmlFor="expense-method" required>
            <Select id="expense-method" value={method} onChange={(e) => setMethod(e.target.value as (typeof FEE_PAYMENT_METHODS)[number])}>
              {FEE_PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {FEE_PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bill or cheque number" htmlFor="expense-reference">
            <Input id="expense-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Remarks" htmlFor="expense-remarks">
            <Textarea id="expense-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={255} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <OnlineOnlyButton type="submit" loading={busy}>
              Record expense
            </OnlineOnlyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

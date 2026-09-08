'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, Undo2, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OnlineOnlyButton } from '@/components/pwa/online-only-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatPaisa } from '@/lib/money'
import { FEE_PAYMENT_METHODS, FEE_PAYMENT_METHOD_LABEL, FEE_VOUCHER_STATUS_LABEL, FEE_VOUCHER_STATUS_TONE } from '@/server/fees/fees-policy'
import type { FeeVoucherDetail } from '@/server/services/fees.service'

/**
 * One voucher: what it came to, what has been received against it, and the
 * two things the office can do to it.
 *
 * The same screen serves the family, who see their own bill without the
 * office's buttons: what may be done comes from the server on the record
 * itself, so the screen never offers what the API would refuse.
 */
export function VoucherDetailScreen({ voucher: initial, today }: { voucher: FeeVoucherDetail; today: string }) {
  const router = useRouter()
  const [voucher, setVoucher] = React.useState(initial)
  const [paying, setPaying] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [seen, setSeen] = React.useState(initial.id + initial.paidPaisa + initial.status)
  if (initial.id + initial.paidPaisa + initial.status !== seen) {
    setSeen(initial.id + initial.paidPaisa + initial.status)
    setVoucher(initial)
  }

  async function run(what: () => Promise<FeeVoucherDetail>, done: string) {
    setBusy(true)
    setError(null)
    try {
      setVoucher(await what())
      toast.success(done)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const live = voucher.payments.filter((p) => p.voidedAt === null)

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>{voucher.voucherNumber}</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {voucher.studentName} · {voucher.studentCode}
              {voucher.sectionLabel ? ` · ${voucher.sectionLabel}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-foreground-subtle">
              {voucher.monthLabel} · {voucher.packageName} · due {formatDate(voucher.dueDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {voucher.overdue ? <Badge variant="danger">Overdue</Badge> : null}
            <Badge variant={FEE_VOUCHER_STATUS_TONE[voucher.status]}>{FEE_VOUCHER_STATUS_LABEL[voucher.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ['Fee', formatPaisa(voucher.grossPaisa)],
              ['Concession', voucher.discountPaisa > 0 ? `− ${formatPaisa(voucher.discountPaisa)}` : '—'],
              ['Late fine', voucher.lateFinePaisa > 0 ? `+ ${formatPaisa(voucher.lateFinePaisa)}` : '—'],
              ['Payable', formatPaisa(voucher.netPayablePaisa)],
              ['Outstanding', formatPaisa(voucher.outstandingPaisa)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-foreground-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {voucher.status === 'CANCELLED' && voucher.cancelReason ? (
            <Alert variant="info" className="mt-4" title="Cancelled">
              {voucher.cancelReason}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="danger" className="mb-4" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          {voucher.canRecordPayment ? (
            <Button type="button" size="sm" onClick={() => setPaying(true)}>
              <Wallet className="h-4 w-4" aria-hidden />
              Record payment
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className={voucher.payments.length === 0 ? '' : 'p-0'}>
          {voucher.payments.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing received yet" description={voucher.blockedReason ?? 'No payment has been recorded against this voucher.'} />
          ) : (
            <ul className="divide-y divide-border">
              {voucher.payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={payment.voidedAt ? 'font-medium text-foreground-subtle line-through' : 'font-medium text-foreground'}>
                      {formatPaisa(payment.amountPaisa)}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {formatDate(payment.paidOn)} · {FEE_PAYMENT_METHOD_LABEL[payment.method]}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                      {payment.receivedBy ? ` · ${payment.receivedBy}` : ''}
                    </p>
                    {payment.voidedAt ? (
                      <p className="text-xs text-danger-600">
                        Voided {formatDateTime(payment.voidedAt)}
                        {payment.voidReason ? ` · ${payment.voidReason}` : ''}
                      </p>
                    ) : null}
                    {payment.remarks ? <p className="text-xs text-foreground-subtle">{payment.remarks}</p> : null}
                  </div>
                  {voucher.canRecordPayment && payment.voidedAt === null ? (
                    <VoidButton
                      busy={busy}
                      onVoid={(reason) => run(() => api.post<FeeVoucherDetail>(`/api/v1/fees/payments/${payment.id}/void`, { reason }), 'Payment voided.')}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {voucher.canCancel ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => setCancelling(true)} disabled={busy}>
            <Ban className="h-4 w-4" aria-hidden />
            Cancel this voucher
          </Button>
        </div>
      ) : null}

      <PaymentDialog
        open={paying}
        onOpenChange={setPaying}
        today={today}
        outstandingPaisa={voucher.outstandingPaisa}
        onRecord={async (body) => {
          await run(() => api.post<FeeVoucherDetail>(`/api/v1/fees/vouchers/${voucher.id}/payments`, body), 'Payment recorded.')
          setPaying(false)
        }}
      />

      <ReasonDialog
        open={cancelling}
        title="Cancel this voucher"
        description="It is kept, marked cancelled, so the record of what was issued stays. Say why."
        confirmLabel="Cancel voucher"
        onOpenChange={setCancelling}
        onConfirm={async (reason) => {
          await run(() => api.post<FeeVoucherDetail>(`/api/v1/fees/vouchers/${voucher.id}/cancel`, { reason }), 'Voucher cancelled.')
          setCancelling(false)
        }}
      />

      {live.length === 0 && voucher.blockedReason && voucher.status !== 'CANCELLED' ? (
        <Alert variant="info" className="mt-4">
          {voucher.blockedReason}
        </Alert>
      ) : null}
    </>
  )
}

function VoidButton({ busy, onVoid }: { busy: boolean; onVoid: (reason: string) => void | Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={busy}>
        <Undo2 className="h-4 w-4" aria-hidden />
        Void
      </Button>
      <ReasonDialog
        open={open}
        title="Void this payment"
        description="The payment is kept and marked voided, and the voucher goes back to what it was. Say why."
        confirmLabel="Void payment"
        onOpenChange={setOpen}
        onConfirm={async (reason) => {
          await onVoid(reason)
          setOpen(false)
        }}
      />
    </>
  )
}

function PaymentDialog({
  open,
  onOpenChange,
  today,
  outstandingPaisa,
  onRecord,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  today: string
  outstandingPaisa: number
  onRecord: (body: Record<string, unknown>) => Promise<void>
}) {
  const [amount, setAmount] = React.useState('')
  const [paidOn, setPaidOn] = React.useState(today)
  const [method, setMethod] = React.useState<(typeof FEE_PAYMENT_METHODS)[number]>('CASH')
  const [reference, setReference] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setAmount(outstandingPaisa > 0 ? String(Math.trunc(outstandingPaisa / 100)) : '')
      setPaidOn(today)
      setMethod('CASH')
      setReference('')
      setRemarks('')
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await onRecord({ amountPaisa: amount, paidOn, method, reference: reference || undefined, remarks: remarks || undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record a payment" description={`Outstanding on this voucher: ${formatPaisa(outstandingPaisa)}.`}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Amount (Rs)" htmlFor="payment-amount" required>
            <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Received on" htmlFor="payment-date" required>
            <Input id="payment-date" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} required />
          </Field>
          <Field label="How" htmlFor="payment-method" required>
            <Select id="payment-method" value={method} onChange={(e) => setMethod(e.target.value as (typeof FEE_PAYMENT_METHODS)[number])}>
              {FEE_PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {FEE_PAYMENT_METHOD_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Slip or cheque number" htmlFor="payment-reference">
            <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Remarks" htmlFor="payment-remarks">
            <Textarea id="payment-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={255} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <OnlineOnlyButton type="submit" loading={busy}>
              Record payment
            </OnlineOnlyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            try {
              await onConfirm(reason)
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <Field label="Reason" htmlFor="reason-text" required>
            <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" variant="danger" loading={busy} disabled={reason.trim().length === 0}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

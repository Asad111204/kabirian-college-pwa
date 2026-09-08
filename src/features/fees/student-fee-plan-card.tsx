'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { formatPaisa, paisaToRupeeInput } from '@/lib/money'
import type { FeePackageView, StudentFeePlanView } from '@/server/services/fees.service'

/**
 * The fee plan on a student's record: which package they are on, and their
 * own concession on top of it.
 *
 * The concession is a monthly amount in rupees. A percentage concession is a
 * package — that is what packages are for — so there is one kind of discount
 * to reason about rather than two.
 */
export function StudentFeePlanCard({
  plan,
  packages,
  canManage,
}: {
  plan: StudentFeePlanView
  packages: FeePackageView[]
  canManage: boolean
}) {
  const router = useRouter()
  const [packageId, setPackageId] = React.useState(plan.feePackageId ?? '')
  const [discount, setDiscount] = React.useState(paisaToRupeeInput(plan.feeDiscountPaisa))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const chosen = packages.find((p) => p.id === packageId) ?? null
  const gross = chosen?.monthlyAmountPaisa ?? null
  const discountPaisa = Math.round(Number(discount.replace(/,/g, '') || '0') * 100)
  const payable = gross === null ? null : Math.max(0, gross - Math.min(Math.max(0, discountPaisa), gross))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/v1/students/${plan.studentId}/fee-plan`, { feePackageId: packageId || undefined, feeDiscountPaisa: discount || 0 })
      toast.success('Fee plan saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The fee plan could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const active = packages.filter((p) => p.isActive || p.id === plan.feePackageId)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Fees</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {plan.packageName ? `On ${plan.packageName}` : 'Not on a fee package, so nothing is billed to them.'}
          </p>
        </div>
        <Link href={`/admin/fees?studentId=${plan.studentId}`} className="text-sm text-primary hover:underline">
          Their vouchers →
        </Link>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <Alert variant="info">
            The college has no fee packages yet. Add one under <Link href="/admin/fees/packages" className="underline">Fees → Packages</Link> before putting anybody on a plan.
          </Alert>
        ) : (
          <form onSubmit={save} className="flex flex-wrap items-end gap-4">
            <Field label="Fee package" htmlFor="plan-package" className="min-w-[14rem] flex-1">
              <Select id="plan-package" value={packageId} onChange={(e) => setPackageId(e.target.value)} disabled={!canManage}>
                <option value="">No package</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatPaisa(p.monthlyAmountPaisa)}
                    {p.isActive ? '' : ' (retired)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Concession (Rs / month)" htmlFor="plan-discount" hint="Taken off every voucher. Never more than the fee itself.">
              <Input id="plan-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={!canManage} className="max-w-[10rem]" />
            </Field>
            {canManage ? (
              <Button type="submit" loading={saving}>
                Save plan
              </Button>
            ) : null}
          </form>
        )}

        <p className="mt-3 text-sm text-foreground-muted">
          {payable === null ? 'No monthly amount until they are on a package.' : <>A month comes to <span className="font-semibold text-foreground">{formatPaisa(payable)}</span> before any late fine.</>}
        </p>

        {error ? (
          <Alert variant="danger" className="mt-3" title="Not saved">
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}

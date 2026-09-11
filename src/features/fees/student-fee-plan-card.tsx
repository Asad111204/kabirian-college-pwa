'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { paisaToRupeeInput } from '@/lib/money'
import { FEE_HEADS } from '@/server/fees/fees-policy'
import type { StudentFeePlanView } from '@/server/services/fees.service'
import { FeeLinesEditor, feeLinesPayload, type FeeLineDraft } from './fee-lines-editor'

/**
 * The fee on a student's record: what they are charged for this year, head by
 * head, and their own concession on top.
 *
 * The college charges by the year and a family pays in instalments, so these
 * are annual amounts — and the year's voucher follows them. Adding a fund to a
 * student who has already been billed adds it to the bill the family is
 * handed; the voucher keeps its number, its due date and every payment already
 * recorded against it.
 */
export function StudentFeePlanCard({ plan, canManage }: { plan: StudentFeePlanView; canManage: boolean }) {
  const router = useRouter()

  const initial = (): FeeLineDraft[] =>
    FEE_HEADS.map((head) => {
      const existing = plan.lines.find((line) => line.head === head)
      return {
        head,
        amount: existing ? paisaToRupeeInput(existing.amountPaisa) : '',
        label: existing?.label ?? '',
      }
    })

  const [lines, setLines] = React.useState<FeeLineDraft[]>(initial)
  const [discount, setDiscount] = React.useState(paisaToRupeeInput(plan.feeDiscountPaisa))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // A different student, or a different year, arrives as a fresh page render.
  const [seen, setSeen] = React.useState(plan.studentId + plan.academicSessionId)
  if (plan.studentId + plan.academicSessionId !== seen) {
    setSeen(plan.studentId + plan.academicSessionId)
    setLines(initial())
    setDiscount(paisaToRupeeInput(plan.feeDiscountPaisa))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/v1/students/${plan.studentId}/fee-plan`, {
        academicSessionId: plan.academicSessionId,
        lines: feeLinesPayload(lines),
        feeDiscountPaisa: discount || 0,
      })
      toast.success('Fee saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The fee could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Fees · {plan.academicSessionName}</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {plan.lines.length === 0 ? 'No fee set for this year yet, so nothing is billed to them.' : "The whole year's fee, head by head."}
          </p>
        </div>
        <Link href={`/admin/fees?studentId=${plan.studentId}`} className="text-sm text-primary hover:underline">
          Their vouchers →
        </Link>
      </CardHeader>
      <CardContent>
        {plan.billed ? (
          <Alert variant="info" className="mb-4">
            A voucher has already been issued for {plan.academicSessionName}. Saving here updates it:
            the voucher keeps its number and every payment already recorded, and what is left to pay
            is worked out again. Nothing that has been received is lost.
          </Alert>
        ) : null}

        <form onSubmit={save}>
          <FeeLinesEditor lines={lines} onChange={setLines} disabled={!canManage} discount={discount} onDiscountChange={setDiscount} />
          {canManage ? (
            <div className="mt-4 flex justify-end">
              <Button type="submit" loading={saving}>
                Save fee
              </Button>
            </div>
          ) : null}
        </form>

        {error ? (
          <Alert variant="danger" className="mt-3" title="Not saved">
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}

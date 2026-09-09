'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { paisaToRupeeInput } from '@/lib/money'
import type { FeeRules } from '@/server/services/fees.service'

/**
 * Admin → Fees → Rules.
 *
 * One rule, because the college has one: what a late voucher costs. It only
 * ever applies to a voucher the college gave a due date, and families here
 * pay in instalments as they can, so most vouchers have neither.
 */
export function FeeRulesScreen({ rules, canManage }: { rules: FeeRules; canManage: boolean }) {
  const router = useRouter()
  const [fine, setFine] = React.useState(paisaToRupeeInput(rules.lateFinePaisa))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.put('/api/v1/fees/rules', { lateFinePaisa: fine })
      toast.success('Fee rules saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The rules could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Late fine</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            A flat amount added once a due date has passed with something still owed.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Alert variant="info" className="mb-4">
          The college charges a fee for the whole year, and a family pays it in instalments whenever they can. A voucher only carries a due date
          if the office sets one when issuing it, and this fine only ever applies to those. Leave it at 0 to charge none at all.
        </Alert>

        <form onSubmit={save} className="flex flex-wrap items-end gap-4">
          <Field label="Late fine (Rs)" htmlFor="fee-late-fine">
            <Input id="fee-late-fine" inputMode="decimal" value={fine} onChange={(e) => setFine(e.target.value)} disabled={!canManage} className="max-w-[10rem]" />
          </Field>
          {canManage ? (
            <Button type="submit" loading={saving}>
              Save rules
            </Button>
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

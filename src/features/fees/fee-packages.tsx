'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatPaisa, paisaToRupeeInput } from '@/lib/money'
import type { FeePackageView, FeeRules } from '@/server/services/fees.service'

/**
 * Admin → Fees → Packages.
 *
 * The named fees the college charges, and the two rules that decide when a
 * voucher falls due and what a late one costs. Amounts are typed in rupees
 * and sent as paisa: the browser never does money arithmetic of its own.
 */
export function FeePackagesScreen({ packages, rules, canManage }: { packages: FeePackageView[]; rules: FeeRules; canManage: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<FeePackageView | null>(null)
  const [creating, setCreating] = React.useState(false)

  return (
    <>
      <FeeRulesCard rules={rules} canManage={canManage} />

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Fee packages</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">
              Each student is put on one of these. A concession for one student is set on the student, not with a package of their own.
            </p>
          </div>
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New package
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <EmptyState icon={Layers} title="No fee packages yet" description="Add the fees the college charges, then put each student on one." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Package</TH>
                    <TH className="text-right">Per month</TH>
                    <TH className="text-right">Students</TH>
                    <TH>In use</TH>
                    {canManage ? <TH className="text-right">Change</TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {packages.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <span className="font-medium text-foreground">{row.name}</span>
                        {row.description ? <span className="block text-xs text-foreground-muted">{row.description}</span> : null}
                      </TD>
                      <TD className="text-right font-medium tabular-nums">{formatPaisa(row.monthlyAmountPaisa)}</TD>
                      <TD className="text-right tabular-nums">{row.studentCount}</TD>
                      <TD>{row.isActive ? <Badge variant="success">In use</Badge> : <Badge variant="neutral">Retired</Badge>}</TD>
                      {canManage ? (
                        <TD className="text-right">
                          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(row)}>
                            <Pencil className="h-4 w-4" aria-hidden />
                            Edit
                          </Button>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>

      <PackageDialog
        open={creating || editing !== null}
        existing={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          router.refresh()
        }}
      />
    </>
  )
}

function FeeRulesCard({ rules, canManage }: { rules: FeeRules; canManage: boolean }) {
  const router = useRouter()
  const [dueDay, setDueDay] = React.useState(String(rules.dueDayOfMonth))
  const [fine, setFine] = React.useState(paisaToRupeeInput(rules.lateFinePaisa))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.put('/api/v1/fees/rules', { dueDayOfMonth: Number(dueDay), lateFinePaisa: fine })
      toast.success('Fee rules saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The rules could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Fee rules</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">When a voucher falls due, and what a late one costs.</p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-wrap items-end gap-4">
          <Field label="Due on day" htmlFor="fee-due-day" hint="A day the month does not have becomes its last day.">
            <Input id="fee-due-day" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} disabled={!canManage} className="max-w-[8rem]" />
          </Field>
          <Field label="Late fine (Rs)" htmlFor="fee-late-fine" hint="A flat amount once the due date has passed. 0 means none.">
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

function PackageDialog({
  open,
  existing,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  existing: FeePackageView | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(existing?.name ?? '')
      setDescription(existing?.description ?? '')
      setAmount(existing ? paisaToRupeeInput(existing.monthlyAmountPaisa) : '')
      setIsActive(existing?.isActive ?? true)
      setError(null)
      setFieldErrors({})
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setFieldErrors({})
    const body = { name, description: description || undefined, monthlyAmountPaisa: amount, isActive }
    try {
      if (existing) await api.put(`/api/v1/fees/packages/${existing.id}`, body)
      else await api.post('/api/v1/fees/packages', body)
      toast.success(existing ? 'Package saved.' : 'Package added.')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        if (e.fields) setFieldErrors(e.fields)
      } else setError('The package could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={existing ? 'Edit fee package' : 'New fee package'} description="The amount is what one month costs on this package.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="package-name" required error={fieldErrors.name?.[0]}>
            <Input id="package-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="1st Year Pre-Medical — Regular" />
          </Field>
          <Field label="Amount per month (Rs)" htmlFor="package-amount" required error={fieldErrors.monthlyAmountPaisa?.[0]}>
            <Input id="package-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="12500" />
          </Field>
          <Field label="Description" htmlFor="package-description" error={fieldErrors.description?.[0]}>
            <Textarea id="package-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={255} />
          </Field>
          <Checkbox
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            label="In use"
            description="A retired package keeps its old vouchers, but nobody new can be put on it."
          />

          {error ? (
            <Alert variant="danger" title="Not saved">
              {error}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {existing ? 'Save package' : 'Add package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

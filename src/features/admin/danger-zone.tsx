'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { DeletionReport } from '@/server/services/deletion.service'

/**
 * Erasing a record for good.
 *
 * The server has already worked out whether it can be done and what stands in
 * the way, so this screen never offers a button the API would refuse — and
 * when it refuses, it says what the records still hold rather than "cannot
 * delete". The confirmation is the record's own code, not the word "delete":
 * you cannot type it without looking at which record you are on.
 */
export function DangerZone({ report, endpoint, afterDelete }: { report: DeletionReport; endpoint: string; afterDelete: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function erase(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.delete(`${endpoint}?confirm=${encodeURIComponent(typed)}`)
      toast.success('Erased for good.')
      router.push(afterDelete)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That could not be erased. Please try again.')
      setBusy(false)
    }
  }

  return (
    <Card className="border-danger-600/40">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="text-danger-700">Erase permanently</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            This removes the record from the database for good. There is no undo, and deactivating is almost always the better answer.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {report.canDelete ? (
          <>
            <Alert variant="warning" className="mb-3" title="Nothing refers to this record">
              It can be erased. {report.alsoRemoved.length > 0 ? `${report.alsoRemoved.join(' and ')} will go with it.` : ''}
            </Alert>
            <Button type="button" variant="danger" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Erase this {report.noun}
            </Button>
          </>
        ) : (
          <Alert variant="info" title="This record cannot be erased">
            {report.reason}
            {report.blockers.length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {report.blockers.map((blocker) => (
                  <li key={blocker.what} className="flex items-center gap-2 text-sm">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning-600" aria-hidden />
                    {blocker.count} {blocker.what}
                  </li>
                ))}
              </ul>
            ) : null}
          </Alert>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Erase ${report.label}?`} description="This cannot be undone. Type the code below to confirm you have the right record.">
          <form onSubmit={erase} className="space-y-4">
            <Field label={`Type ${report.confirmWith} to confirm`} htmlFor="erase-confirm" required>
              <Input id="erase-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required />
            </Field>

            {error ? (
              <Alert variant="danger" title="Not erased">
                {error}
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Keep it
              </Button>
              <Button type="submit" variant="danger" loading={busy} disabled={typed.trim().toLowerCase() !== report.confirmWith.toLowerCase()}>
                Erase for good
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

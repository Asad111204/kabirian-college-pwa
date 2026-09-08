'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'

/**
 * The office reopens one mark sheet after the exam's deadline.
 *
 * One paper, one section, until a stated day, for a stated reason — kept on
 * the row and in the audit log, so the decision can be explained later.
 */
export function ReopenSheetDialog({
  sheetId,
  label,
  open,
  onOpenChange,
}: {
  sheetId: string | null
  /** "Biology · 1st Year · Section A", for the dialog's description. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [until, setUntil] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setUntil('')
      setReason('')
      setError(null)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!sheetId) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/v1/marks/sheets/${sheetId}/reopen`, { reopenedUntil: until, reason })
      toast.success('The paper is open again for its teacher.')
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The paper could not be reopened.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent title="Reopen this paper?" description={label}>
        <form className="space-y-4" onSubmit={submit}>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Alert variant="info">
            The teacher can enter and correct marks for this one paper until the day you choose. The sheet keeps its current status, and every
            change is recorded in the audit log as before.
          </Alert>
          <Field label="Open until" htmlFor="reopen-until" required hint="The last day the teacher may work on it.">
            <Input id="reopen-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="max-w-[12rem]" required />
          </Field>
          <Field label="Reason" htmlFor="reopen-reason" required hint="Kept on the record — for example “paper re-checked after a query from the student”.">
            <Textarea id="reopen-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!until || reason.trim().length === 0}>
              Reopen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

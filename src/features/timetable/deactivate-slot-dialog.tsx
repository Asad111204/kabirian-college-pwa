'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { TimetableSlotRow } from '@/server/services/timetable.service'

/**
 * Confirm emptying a cell.
 *
 * There is no delete anywhere in this screen. The row is deactivated, which is
 * what the API's DELETE does: the lesson stops being part of the working week
 * but stays in the record, and because the uniqueness indexes count active rows
 * only, the cell is genuinely free again afterwards.
 */
export function DeactivateSlotDialog({
  open,
  onOpenChange,
  slot,
  dayLabel,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: TimetableSlotRow | null
  dayLabel: string
  onDone: () => void | Promise<void>
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setError(null)
  }

  async function confirm() {
    if (!slot) return
    setSubmitting(true)
    setError(null)
    try {
      await api.delete(`/api/v1/timetable/${slot.id}`)
      await onDone()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not deactivate that entry. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!slot) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Deactivate this timetable entry?"
        description={`${slot.subjectName} · ${slot.staffName} · ${dayLabel}, period ${slot.period}`}
      >
        <div className="space-y-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}

          <p className="text-sm text-foreground-muted">
            It will no longer appear as an active class, but it stays in the timetable’s history.
            The period becomes free, so you can put a different class in it.
          </p>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirm} disabled={submitting}>
              {submitting ? 'Deactivating…' : 'Deactivate entry'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

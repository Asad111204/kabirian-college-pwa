'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { DAY_LABEL, TIMETABLE_DAYS, type DayOfWeekValue } from '@/validation/timetable'

interface CopyDayResult {
  copied: number
  cleared: number
  skipped: string[]
  occupied: DayOfWeekValue[]
}

/**
 * Copying one day of the week onto others.
 *
 * A college week repeats. Monday, Wednesday and Friday are often the same day
 * three times over, and typing it out three times is a chore and three chances
 * to get it wrong.
 *
 * Two things this screen has to be honest about. A lesson shared with other
 * sections is copied whole, because it is one lesson covering all of them. And
 * a day that already has lessons is left alone unless the office ticks the box
 * that says to overwrite it — the server refuses either way; the box is how
 * the office says it meant to.
 */
export function CopyDayDialog({
  open,
  onOpenChange,
  sectionId,
  sectionLabel,
  onCopied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionId: string
  sectionLabel: string
  onCopied: () => void | Promise<void>
}) {
  const [fromDay, setFromDay] = React.useState<DayOfWeekValue>('MONDAY')
  const [toDays, setToDays] = React.useState<DayOfWeekValue[]>([])
  const [replace, setReplace] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<CopyDayResult | null>(null)

  // Reset as the dialog opens, during render rather than in an effect, so it
  // never flashes the previous run's answer.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setToDays([])
      setReplace(false)
      setError(null)
      setResult(null)
    }
  }

  // A day cannot be copied onto itself, so it is never offered as a target.
  const targets = TIMETABLE_DAYS.filter((day) => day !== fromDay)
  const chosen = toDays.filter((day) => day !== fromDay)

  async function copy() {
    setBusy(true)
    setError(null)
    try {
      const response = await api.post<CopyDayResult>('/api/v1/timetable/copy-day', {
        sectionId,
        fromDay,
        toDays: chosen,
        replace,
      })
      setResult(response)
      if (response.copied > 0) {
        toast.success(`${response.copied} lesson${response.copied === 1 ? '' : 's'} copied.`)
        await onCopied()
      } else {
        toast.info('Nothing was copied.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent title="Copy a day" description={sectionLabel} className="sm:max-w-lg">
        {result ? (
          <div className="space-y-3">
            <Alert variant={result.copied > 0 ? 'success' : 'info'} title={`${result.copied} lesson${result.copied === 1 ? '' : 's'} copied`}>
              {result.cleared > 0 ? `${result.cleared} that were already there were removed first.` : null}
            </Alert>

            {result.occupied.length > 0 ? (
              <Alert variant="warning" title="Some days already had lessons">
                {result.occupied.map((day) => DAY_LABEL[day]).join(', ')}{' '}
                {result.occupied.length === 1 ? 'was' : 'were'} left alone. Tick “replace what is
                already there” if you meant to overwrite.
              </Alert>
            ) : null}

            {result.skipped.length > 0 ? (
              <Alert variant="warning" title={`${result.skipped.length} could not be copied`}>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {result.skipped.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Field label="Copy this day" htmlFor="copy-from" required>
              <Select
                id="copy-from"
                value={fromDay}
                disabled={busy}
                onChange={(e) => setFromDay(e.target.value as DayOfWeekValue)}
              >
                {TIMETABLE_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABEL[day]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="On to" required>
              <div className="space-y-1 rounded-lg border border-border p-3">
                {targets.map((day) => (
                  <Checkbox
                    key={day}
                    label={DAY_LABEL[day]}
                    checked={chosen.includes(day)}
                    disabled={busy}
                    onChange={() =>
                      setToDays((current) =>
                        current.includes(day) ? current.filter((other) => other !== day) : [...current, day],
                      )
                    }
                  />
                ))}
              </div>
            </Field>

            <Checkbox
              label="Replace what is already there"
              description="Without this, a day that already has lessons is left exactly as it is."
              checked={replace}
              disabled={busy}
              onChange={() => setReplace((current) => !current)}
            />

            <Alert variant="info">
              A lesson shared with other sections is copied whole, because it is one lesson covering
              all of them. Anything that clashes on the new day — a teacher already busy, a room
              taken — is reported rather than forced.
            </Alert>

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={copy} loading={busy} disabled={chosen.length === 0}>
                Copy {DAY_LABEL[fromDay]}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { EventDetail } from '@/server/services/events.service'
import { AUDIENCE_LABEL, POPULATION_AUDIENCES } from '@/validation/notices'

interface EventFormValues {
  title: string
  description: string
  startsAt: string
  endsAt: string
  location: string
  audience: (typeof POPULATION_AUDIENCES)[number]
}

const BLANK: EventFormValues = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  location: '',
  audience: 'ALL',
}

function fromDetail(event: EventDetail): EventFormValues {
  return {
    title: event.title,
    description: event.description ?? '',
    startsAt: event.startsAtLocal,
    endsAt: event.endsAtLocal ?? '',
    location: event.location ?? '',
    audience: event.audience,
  }
}

/**
 * Create or edit an event.
 *
 * An event is for everyone, all students or all staff -- a whole population.
 * Aiming one at a section would make it a notice with a date on it, and the
 * notice form does that already. Times are typed on the college's clock and
 * converted on the server (ADR-151). There is no status control: publishing
 * and cancelling are their own confirmed actions on the event's page.
 */
export function EventEditorDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: EventDetail
  onSaved: (event: EventDetail) => void | Promise<void>
}) {
  const editing = Boolean(initial)
  const [values, setValues] = React.useState<EventFormValues>(initial ? fromDetail(initial) : BLANK)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initial ? fromDetail(initial) : BLANK)
      setFormError(null)
      setFieldErrors({})
    }
  }

  const set = (patch: Partial<EventFormValues>) => setValues((v) => ({ ...v, ...patch }))
  const errorOf = (field: string) => fieldErrors[field]?.[0]

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      startsAt: values.startsAt,
      endsAt: values.endsAt || '',
      location: values.location.trim() || undefined,
      audience: values.audience,
    }

    try {
      const saved = editing
        ? await api.put<EventDetail>(`/api/v1/events/${initial!.id}`, payload)
        : await api.post<EventDetail>('/api/v1/events', payload)
      toast.success(editing ? 'Event updated.' : 'Event saved as a draft.')
      onOpenChange(false)
      await onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit event' : 'Create an event'}
        description={
          editing ? 'Changes replace the details.' : 'It is saved as a draft. Publish it from its own page when it is ready.'
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <Field label="Title" htmlFor="event-title" required error={errorOf('title')}>
            <Input
              id="event-title"
              value={values.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Annual sports day"
              autoFocus
              required
              maxLength={200}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="event-starts" required error={errorOf('startsAt')}>
              <Input
                id="event-starts"
                type="datetime-local"
                value={values.startsAt}
                onChange={(e) => set({ startsAt: e.target.value })}
                required
              />
            </Field>
            <Field label="Ends" htmlFor="event-ends" hint="Optional." error={errorOf('endsAt')}>
              <Input
                id="event-ends"
                type="datetime-local"
                value={values.endsAt}
                onChange={(e) => set({ endsAt: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where" htmlFor="event-location" error={errorOf('location')}>
              <Input
                id="event-location"
                value={values.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="e.g. Main hall"
                maxLength={200}
              />
            </Field>
            <Field label="Who it is for" htmlFor="event-audience" error={errorOf('audience')}>
              <Select
                id="event-audience"
                value={values.audience}
                onChange={(e) => set({ audience: e.target.value as EventFormValues['audience'] })}
              >
                {POPULATION_AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABEL[a]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="About the event" htmlFor="event-description" error={errorOf('description')}>
            <Textarea
              id="event-description"
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={4}
              placeholder="Optional. Line breaks are kept."
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

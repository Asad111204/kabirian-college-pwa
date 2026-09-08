'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_LABEL, type ComplaintCategoryValue } from '@/server/complaints/complaints-policy'
import type { ComplaintDetail } from '@/server/services/complaints.service'

/**
 * A student writes an application to the office.
 *
 * Deliberately plain: what it is about, one line of subject, and what
 * happened. Once it is sent it cannot be edited — it is what the student
 * said, on the record — and the screen says so before they send it.
 */
export function ComplaintFormDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: (complaint: ComplaintDetail) => void | Promise<void>
}) {
  const [category, setCategory] = React.useState<ComplaintCategoryValue>('ACADEMIC')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCategory('ACADEMIC')
      setSubject('')
      setBody('')
      setError(null)
      setFieldErrors({})
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const sent = await api.post<ComplaintDetail>('/api/v1/complaints', { category, subject, body })
      await onSent(sent)
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        if (e.fields) setFieldErrors(e.fields)
      } else setError('Your application could not be sent. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Write to the office" description="The office reads every application. Only you and the office can see it.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="What is it about?" htmlFor="complaint-category" required error={fieldErrors.category?.[0]}>
            <Select id="complaint-category" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategoryValue)}>
              {COMPLAINT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {COMPLAINT_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor="complaint-subject" required hint="One line, so the office can see at a glance what it is." error={fieldErrors.subject?.[0]}>
            <Input id="complaint-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required />
          </Field>

          <Field
            label="What happened?"
            htmlFor="complaint-body"
            required
            hint="Give dates and names where you can. Once sent, an application cannot be edited — you can add more to it afterwards."
            error={fieldErrors.body?.[0]}
          >
            <Textarea id="complaint-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000} required />
          </Field>

          {error ? (
            <Alert variant="danger" title="Not sent">
              {error}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Send to the office
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

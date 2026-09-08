'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { HomeworkDetail, HomeworkOptions } from '@/server/services/homework.service'

export interface HomeworkEditorValues {
  sectionId: string
  subjectId: string
  title: string
  instructions: string
  dueDate: string
}

/**
 * Set a piece of homework, or change one.
 *
 * The section and subject come from the person's own assignments (or, for
 * the office, every assignment in the current session), so the form cannot
 * offer a section the server would refuse. Once set, the section and subject
 * are fixed: a piece belongs where it was set.
 */
export function HomeworkEditorDialog({
  open,
  onOpenChange,
  options,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: HomeworkOptions
  existing?: HomeworkDetail | null
  onSaved: (homework: HomeworkDetail) => void | Promise<void>
}) {
  const first = options.targets[0]
  const initial = (): HomeworkEditorValues =>
    existing
      ? { sectionId: existing.sectionId, subjectId: existing.subjectId, title: existing.title, instructions: existing.instructions, dueDate: existing.dueDate ?? '' }
      : { sectionId: first?.sectionId ?? '', subjectId: first?.subjectId ?? '', title: '', instructions: '', dueDate: '' }
  const [values, setValues] = React.useState<HomeworkEditorValues>(initial)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // A fresh form each time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initial())
      setError(null)
      setFieldErrors({})
    }
  }

  const targetKey = `${values.sectionId}|${values.subjectId}`
  const errorOf = (field: string) => fieldErrors[field]?.[0]

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const saved = existing
        ? await api.put<HomeworkDetail>(`/api/v1/homework/${existing.id}`, { title: values.title, instructions: values.instructions, dueDate: values.dueDate || undefined })
        : await api.post<HomeworkDetail>('/api/v1/homework', { ...values, dueDate: values.dueDate || undefined })
      await onSaved(saved)
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        if (e.fields) setFieldErrors(e.fields)
      } else setError('The homework could not be saved. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={existing ? 'Change homework' : 'Set homework'} description={existing ? undefined : 'For one section in one subject you teach.'}>
        <form className="space-y-4" onSubmit={submit}>
          {error ? <Alert variant="danger">{error}</Alert> : null}

          {existing ? (
            <p className="text-sm text-foreground-muted">
              {existing.subjectName} · Section {existing.sectionName}
            </p>
          ) : options.targets.length === 0 ? (
            <Alert variant="warning">You have no active teaching assignments, so there is no section to set homework for.</Alert>
          ) : (
            <Field label="Section and subject" htmlFor="hw-target" required error={errorOf('sectionId') ?? errorOf('subjectId')}>
              <Select
                id="hw-target"
                value={targetKey}
                onChange={(e) => {
                  const [sectionId, subjectId] = e.target.value.split('|')
                  setValues({ ...values, sectionId: sectionId ?? '', subjectId: subjectId ?? '' })
                }}
              >
                {options.targets.map((t) => (
                  <option key={`${t.sectionId}|${t.subjectId}`} value={`${t.sectionId}|${t.subjectId}`}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Title" htmlFor="hw-title" required error={errorOf('title')}>
            <Input id="hw-title" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} maxLength={200} placeholder="e.g. Exercise 3.2, questions 1–10" />
          </Field>
          <Field label="Instructions" htmlFor="hw-instructions" hint="What to do, and how it will be checked." error={errorOf('instructions')}>
            <Textarea id="hw-instructions" rows={5} value={values.instructions} onChange={(e) => setValues({ ...values, instructions: e.target.value })} maxLength={4000} />
          </Field>
          <Field label="Due date" htmlFor="hw-due" hint="Leave empty if there is no fixed date." error={errorOf('dueDate')}>
            <Input id="hw-due" type="date" value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} className="max-w-[12rem]" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={!existing && options.targets.length === 0}>
              {existing ? 'Save changes' : 'Set homework'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

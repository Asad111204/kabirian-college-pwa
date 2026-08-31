'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'

export interface ExamTypeOption {
  id: string
  name: string
}

export interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}

export interface ExamFormValues {
  id?: string
  name: string
  examTypeId: string
  academicSessionId: string
  startDate: string
  endDate: string
  description: string
}

/**
 * Create or edit an exam.
 *
 * The exam types and sessions are handed in from the server — the form never
 * decides what a "First Term" is, and a college that renames its terms sees the
 * new names here immediately.
 *
 * There is no status field on purpose. Cancelling an exam and publishing its
 * date sheet are separate, audited actions; a stray value on this form must
 * never be able to do either.
 */
export function ExamFormDialog({
  open,
  onOpenChange,
  examTypes,
  sessions,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  examTypes: ExamTypeOption[]
  sessions: SessionOption[]
  initial?: ExamFormValues
  onSaved?: (examId: string) => void
}) {
  const router = useRouter()
  const editing = Boolean(initial?.id)

  const blank = React.useMemo<ExamFormValues>(
    () => ({
      name: '',
      examTypeId: examTypes[0]?.id ?? '',
      academicSessionId: sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? '',
      startDate: '',
      endDate: '',
      description: '',
    }),
    [examTypes, sessions],
  )

  const [values, setValues] = React.useState<ExamFormValues>(initial ?? blank)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // Reset whenever the dialog is opened, so a cancelled edit never leaks into
  // the next one. Adjusted during render rather than in an effect: React
  // supports this for exactly this case, and an effect would show the previous
  // values for one frame first.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initial ?? blank)
      setFormError(null)
      setFieldErrors({})
    }
  }

  const set = (patch: Partial<ExamFormValues>) => setValues((v) => ({ ...v, ...patch }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const payload = {
      name: values.name.trim(),
      examTypeId: values.examTypeId,
      academicSessionId: values.academicSessionId,
      startDate: values.startDate || '',
      endDate: values.endDate || '',
      description: values.description.trim() || undefined,
    }

    try {
      const saved = editing
        ? await api.put<{ id: string }>(`/api/v1/exams/${initial!.id}`, payload)
        : await api.post<{ id: string }>('/api/v1/exams', payload)

      toast.success(editing ? 'Exam updated.' : 'Exam created.')
      onOpenChange(false)
      router.refresh()
      onSaved?.(saved.id)
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

  const errorOf = (field: string) => fieldErrors[field]?.[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit exam' : 'Create an exam'}
        description={
          editing
            ? 'Changes apply while the date sheet is still a draft.'
            : 'Set it up first; papers and the date sheet come next.'
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <Field label="Exam name" htmlFor="exam-name" required error={errorOf('name')}>
            <Input
              id="exam-name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. First Term Examination 2026"
              autoFocus
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exam type" htmlFor="exam-type" required error={errorOf('examTypeId')}>
              <Select
                id="exam-type"
                value={values.examTypeId}
                onChange={(e) => set({ examTypeId: e.target.value })}
                required
              >
                {examTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Academic session"
              htmlFor="exam-session"
              required
              error={errorOf('academicSessionId')}
            >
              <Select
                id="exam-session"
                value={values.academicSessionId}
                onChange={(e) => set({ academicSessionId: e.target.value })}
                required
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                    {session.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Starts"
              htmlFor="exam-start"
              hint="Optional. Papers must fall inside these dates."
              error={errorOf('startDate')}
            >
              <Input
                id="exam-start"
                type="date"
                value={values.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
              />
            </Field>

            <Field label="Ends" htmlFor="exam-end" error={errorOf('endDate')}>
              <Input
                id="exam-end"
                type="date"
                value={values.endDate}
                onChange={(e) => set({ endDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="exam-description" error={errorOf('description')}>
            <Textarea
              id="exam-description"
              rows={2}
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Optional note for the office."
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {editing ? 'Save changes' : 'Create exam'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

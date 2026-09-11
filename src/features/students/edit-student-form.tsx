'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { studentUpdateSchema } from '@/validation/students'
import { StudentDetailsFields } from './student-details-fields'
import { studentDetailsPayload, type StudentDetailsValue } from './student-details'

/**
 * Correcting a student's record.
 *
 * The boxes are the very same ones the admission form uses — one component,
 * used twice — so there is no such thing as a field the office can enter at
 * admission and then never fix. A name spelt wrong at the counter, a CNIC
 * typed from a bad photocopy, a phone number that has changed: all of it is
 * the office's to correct.
 *
 * **Not here on purpose.** Where the student *sits* (session, class, section,
 * roll number) is changed by Transfer or Promote, which write a new enrollment
 * rather than overwriting the old one — a student's history is the point of
 * that model, and an edit form would quietly destroy it. Their status is
 * changed by the status action, which records a reason. The student ID is
 * assigned once and never changes.
 *
 * Every save is audited, field by field, by the service.
 */
export function EditStudentForm({
  studentId,
  studentCode,
  initial,
}: {
  studentId: string
  studentCode: string
  initial: StudentDetailsValue
}) {
  const router = useRouter()

  const [details, setDetails] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // Nothing to save until something is actually different, so the office
  // cannot file an "edit" that changed nothing and clutter the audit log.
  const changed = React.useMemo(
    () => (Object.keys(initial) as (keyof StudentDetailsValue)[]).some((key) => details[key] !== initial[key]),
    [details, initial],
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const payload = studentDetailsPayload(details)

    // Checked here for instant feedback; the server checks again for real.
    const parsed = studentUpdateSchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[issue.path.length - 1] ?? '_')
        ;(errors[key] ??= []).push(issue.message)
      }
      setFieldErrors(errors)
      setFormError('Please check the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      await api.put(`/api/v1/students/${studentId}`, payload)
      toast.success('The student record has been updated.')
      router.push(`/admin/students/${studentId}`)
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError ? <Alert variant="danger">{formError}</Alert> : null}

      <StudentDetailsFields
        value={details}
        onChange={setDetails}
        errors={fieldErrors}
        disabled={saving}
        admission={{ mode: 'edit', studentCode }}
        autoFocus
      />

      <Alert variant="info">
        Where the student sits is changed by <strong>Transfer</strong> or <strong>Promote</strong> on
        their profile, so their history is kept rather than overwritten. Their status is changed by
        the status action, which records a reason.
      </Alert>

      <div className="flex flex-wrap justify-end gap-2 pb-6">
        <Button type="button" variant="secondary" asChild disabled={saving}>
          <Link href={`/admin/students/${studentId}`}>Cancel</Link>
        </Button>
        <Button type="submit" loading={saving} disabled={!changed}>
          {saving ? (
            'Saving…'
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

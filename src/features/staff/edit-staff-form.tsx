'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { staffUpdateSchema } from '@/validation/staff'
import { StaffDetailsFields } from './staff-details-fields'
import type { StaffDetailsValue } from './staff-details'

/**
 * Correcting a staff record.
 *
 * The same boxes the "add staff" form uses, so nothing can be entered once and
 * then be stuck for ever: a designation that changed, a qualification finished,
 * a salary revised, a CNIC typed wrong at the counter.
 *
 * **Not here on purpose.** Employment status and leaving date are changed by
 * the status action on the profile, which asks for a reason and decides what
 * happens to their assignments. Their subjects and sections are held as
 * assignments, which have their own history. The staff ID never changes.
 *
 * Every save is audited, field by field, by the service.
 */
export function EditStaffForm({
  staffId,
  staffCode,
  initial,
  designations,
  departments,
}: {
  staffId: string
  staffCode: string
  initial: StaffDetailsValue
  designations: { id: string; name: string; isTeaching: boolean }[]
  departments: { id: string; name: string }[]
}) {
  const router = useRouter()

  const [details, setDetails] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const changed = React.useMemo(
    () => (Object.keys(initial) as (keyof StaffDetailsValue)[]).some((key) => details[key] !== initial[key]),
    [details, initial],
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    // The salary box holds rupees, which is what `amountPaisa` reads a string
    // as. It is never sent as the stored paisa figure — see `staffDetailsFrom`.
    const payload = { ...details }

    const parsed = staffUpdateSchema.safeParse(payload)
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
      await api.put(`/api/v1/staff/${staffId}`, payload)
      toast.success('The staff record has been updated.')
      router.push(`/admin/staff/${staffId}`)
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

      <StaffDetailsFields
        value={details}
        onChange={setDetails}
        errors={fieldErrors}
        disabled={saving}
        designations={designations}
        departments={departments}
        staffCode={staffCode}
        staffCodeHint="Assigned when the record was created. This never changes."
        autoFocus
      />

      <Alert variant="info">
        Whether they are still employed is changed by the status action on their profile, which asks
        for a reason. Their subjects and sections are held as assignments, so those keep their own
        history.
      </Alert>

      <div className="flex flex-wrap justify-end gap-2 pb-6">
        <Button type="button" variant="secondary" asChild disabled={saving}>
          <Link href={`/admin/staff/${staffId}`}>Cancel</Link>
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

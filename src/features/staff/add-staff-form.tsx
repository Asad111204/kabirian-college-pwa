'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { staffCreateSchema } from '@/validation/staff'
import { TemporaryPasswordPanel } from '@/features/users/shared'
import { StaffDetailsFields } from './staff-details-fields'
import { EMPTY_STAFF_DETAILS, type StaffDetailsValue } from './staff-details'

interface CreatedStaff {
  staff: { id: string; staffCode: string; fullName: string }
  account?: { username: string; temporaryPassword: string }
}

const EMPTY: StaffDetailsValue = {
  ...EMPTY_STAFF_DETAILS,
  joiningDate: new Date().toISOString().slice(0, 10),
}

/**
 * Adds a staff member, and optionally their portal login at the same time.
 *
 * Designation and department come from reference tables, so the college's own
 * lists appear here — adding "Senior Lecturer" in Academic Management makes it
 * selectable immediately, with no code change.
 */
export function AddStaffForm({
  designations,
  departments,
  nextStaffCode,
}: {
  designations: { id: string; name: string; isTeaching: boolean }[]
  departments: { id: string; name: string }[]
  nextStaffCode: string | null
}) {
  const router = useRouter()
  const [form, setForm] = React.useState(EMPTY)
  const [createAccount, setCreateAccount] = React.useState(false)
  const [username, setUsername] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [created, setCreated] = React.useState<CreatedStaff | null>(null)

  function suggestUsername(fullName: string): string {
    return fullName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const payload = { ...form, createAccount, username: createAccount ? username : undefined }

    const parsed = staffCreateSchema.safeParse(payload)
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

    setSubmitting(true)
    try {
      const result = await api.post<CreatedStaff>('/api/v1/staff', payload)
      setCreated(result)
      toast.success(`${result.staff.fullName} added as ${result.staff.staffCode}.`)
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

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <Alert variant="success" title={`${created.staff.fullName} has been added`}>
            Staff ID <strong>{created.staff.staffCode}</strong>
          </Alert>

          {created.account ? (
            <TemporaryPasswordPanel
              username={created.account.username}
              password={created.account.temporaryPassword}
              context="created"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/admin/staff/${created.staff.id}`}>Open staff profile</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreated(null)
                setForm({ ...EMPTY })
                setCreateAccount(false)
                setUsername('')
                router.refresh()
              }}
            >
              Add another
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/admin/staff">Back to the list</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError ? <Alert variant="danger">{formError}</Alert> : null}

      <StaffDetailsFields
        value={form}
        onChange={(next) => {
          // The username follows the name only while the office has not typed
          // its own; once they have, it is theirs.
          if (createAccount && next.fullName !== form.fullName && username === suggestUsername(form.fullName)) {
            setUsername(suggestUsername(next.fullName))
          }
          setForm(next)
        }}
        errors={fieldErrors}
        disabled={submitting}
        designations={designations}
        departments={departments}
        staffCode={nextStaffCode ?? 'STF-…'}
        staffCodeHint="Generated automatically when you save."
        autoFocus
      />

      <Card>
        <CardHeader>
          <CardTitle>Staff portal account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Checkbox
            label="Create a staff portal account"
            description="Lets the teacher sign in to see their assignments and their own students. You can also add this later."
            checked={createAccount}
            onChange={(e) => {
              setCreateAccount(e.target.checked)
              if (e.target.checked && !username) setUsername(suggestUsername(form.fullName))
            }}
            disabled={submitting}
          />

          {createAccount ? (
            <Field
              label="Username"
              htmlFor="username"
              required
              hint="A temporary password is generated and shown once after saving."
              error={fieldErrors.username}
            >
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="e.g. muhammad.ahmed"
                className="font-mono"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2 pb-6">
        <Button type="button" variant="secondary" asChild disabled={submitting}>
          <Link href="/admin/staff">Cancel</Link>
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? (
            'Saving…'
          ) : (
            <>
              <Save className="h-4 w-4" />
              Add staff member
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

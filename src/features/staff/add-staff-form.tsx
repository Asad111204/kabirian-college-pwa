'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { staffCreateSchema, STAFF_TYPES, STAFF_TYPE_LABEL } from '@/validation/staff'
import { TemporaryPasswordPanel } from '@/features/users/shared'

interface CreatedStaff {
  staff: { id: string; staffCode: string; fullName: string }
  account?: { username: string; temporaryPassword: string }
}

const EMPTY = {
  fullName: '',
  fatherOrHusbandName: '',
  dateOfBirth: '',
  gender: '',
  cnicNumber: '',
  phone: '',
  email: '',
  address: '',
  designationId: '',
  departmentId: '',
  staffType: 'TEACHING',
  joiningDate: new Date().toISOString().slice(0, 10),
  qualification: '',
  notes: '',
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

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Staff ID" hint="Generated automatically when you save.">
            <Input value={nextStaffCode ?? 'STF-…'} disabled readOnly className="font-mono" />
          </Field>

          <Field label="Joining date" htmlFor="joiningDate" required error={fieldErrors.joiningDate}>
            <Input
              id="joiningDate"
              type="date"
              value={form.joiningDate}
              onChange={(e) => set('joiningDate', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            label="Designation"
            htmlFor="designationId"
            required
            hint="Managed in Academic Management → Designations."
            error={fieldErrors.designationId}
          >
            <Select
              id="designationId"
              value={form.designationId}
              onChange={(e) => set('designationId', e.target.value)}
              disabled={submitting}
            >
              <option value="">Select a designation…</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Department" htmlFor="departmentId" error={fieldErrors.departmentId}>
            <Select
              id="departmentId"
              value={form.departmentId}
              onChange={(e) => set('departmentId', e.target.value)}
              disabled={submitting}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Staff type"
            htmlFor="staffType"
            required
            hint="Only teaching staff can be assigned subjects."
            error={fieldErrors.staffType}
          >
            <Select
              id="staffType"
              value={form.staffType}
              onChange={(e) => set('staffType', e.target.value)}
              disabled={submitting}
            >
              {STAFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STAFF_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Qualification" htmlFor="qualification" error={fieldErrors.qualification}>
            <Input
              id="qualification"
              value={form.qualification}
              onChange={(e) => set('qualification', e.target.value)}
              placeholder="e.g. MSc Botany"
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => {
                set('fullName', e.target.value)
                if (createAccount && username === suggestUsername(form.fullName)) {
                  setUsername(suggestUsername(e.target.value))
                }
              }}
              placeholder="e.g. Muhammad Ahmed"
              disabled={submitting}
              autoFocus
            />
          </Field>

          <Field
            label="Father's / husband's name"
            htmlFor="fatherOrHusbandName"
            error={fieldErrors.fatherOrHusbandName}
          >
            <Input
              id="fatherOrHusbandName"
              value={form.fatherOrHusbandName}
              onChange={(e) => set('fatherOrHusbandName', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={fieldErrors.dateOfBirth}>
            <Input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Gender" htmlFor="gender" error={fieldErrors.gender}>
            <Select
              id="gender"
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
              disabled={submitting}
            >
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field label="CNIC" htmlFor="cnicNumber" hint="Format: 12345-1234567-1" error={fieldErrors.cnicNumber}>
            <Input
              id="cnicNumber"
              value={form.cnicNumber}
              onChange={(e) => set('cnicNumber', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="phone" hint="Format: 0300-1234567" error={fieldErrors.phone}>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0300-1234567"
              disabled={submitting}
            />
          </Field>

          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Address" htmlFor="address" className="sm:col-span-2" error={fieldErrors.address}>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

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

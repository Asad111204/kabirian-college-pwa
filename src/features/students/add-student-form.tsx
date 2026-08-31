'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { studentCreateSchema } from '@/validation/students'
import { TemporaryPasswordPanel } from '@/features/users/shared'
import {
  EMPTY_ENROLLMENT,
  EnrollmentPicker,
  useEnrollmentOptions,
  type EnrollmentValue,
  type SessionOption,
} from './enrollment-picker'

interface CreatedStudent {
  student: { id: string; studentCode: string; fullName: string }
  account?: { username: string; temporaryPassword: string }
}

const EMPTY_DETAILS = {
  fullName: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  cnicBformNumber: '',
  fatherName: '',
  fatherCnic: '',
  fatherPhone: '',
  fatherOccupation: '',
  motherName: '',
  guardianName: '',
  guardianRelation: '',
  guardianPhone: '',
  previousInstitution: '',
  previousResultSummary: '',
  previousResultObtained: '',
  previousResultTotal: '',
  matricRollNumber: '',
  matricBoard: '',
  notes: '',
  admissionNumber: '',
  admissionDate: new Date().toISOString().slice(0, 10),
}

/**
 * The admission form, grouped into the sections an administrator thinks in:
 * who the student is, who their guardian is, where they came from, and where
 * they will sit.
 *
 * The student ID and admission number are produced by the server from the
 * shared counters — the browser never invents them.
 */
export function AddStudentForm({
  sessions,
  defaultSessionId,
  nextStudentCode,
  nextAdmissionNumber,
}: {
  sessions: SessionOption[]
  defaultSessionId: string
  nextStudentCode: string | null
  nextAdmissionNumber: string | null
}) {
  const router = useRouter()

  const [details, setDetails] = React.useState(EMPTY_DETAILS)
  const [enrollment, setEnrollment] = React.useState<EnrollmentValue>({
    ...EMPTY_ENROLLMENT,
    academicSessionId: defaultSessionId,
  })
  const [createAccount, setCreateAccount] = React.useState(false)
  const [username, setUsername] = React.useState('')

  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [created, setCreated] = React.useState<CreatedStudent | null>(null)

  const { groups, loading } = useEnrollmentOptions(enrollment.academicSessionId)

  function set(field: keyof typeof EMPTY_DETAILS, value: string) {
    setDetails((prev) => ({ ...prev, [field]: value }))
  }

  /** Suggests a username from the name: "Muhammad Ali" → "muhammad.ali" */
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

  function buildPayload() {
    const numeric = (value: string) => (value.trim() === '' ? undefined : Number(value))
    return {
      ...details,
      previousResultObtained: numeric(details.previousResultObtained),
      previousResultTotal: numeric(details.previousResultTotal),
      enrollment: {
        academicSessionId: enrollment.academicSessionId,
        classId: enrollment.classId,
        divisionId: enrollment.divisionId,
        programId: enrollment.programId,
        sectionId: enrollment.sectionId,
        rollNumber: enrollment.rollNumber,
      },
      createAccount,
      username: createAccount ? username : undefined,
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const payload = buildPayload()

    // Checked here for instant feedback; the server checks again for real.
    const parsed = studentCreateSchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        // "enrollment.sectionId" → "sectionId" so the picker can show it
        const key = String(issue.path[issue.path.length - 1] ?? '_')
        ;(errors[key] ??= []).push(issue.message)
      }
      setFieldErrors(errors)
      setFormError('Please check the highlighted fields.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.post<CreatedStudent>('/api/v1/students', payload)
      setCreated(result)
      toast.success(`${result.student.fullName} admitted as ${result.student.studentCode}.`)
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

  /* ---------------------------------------------------------------- */
  /* Success screen                                                    */
  /* ---------------------------------------------------------------- */
  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <Alert variant="success" title={`${created.student.fullName} has been admitted`}>
            Student ID <strong>{created.student.studentCode}</strong>
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
              <Link href={`/admin/students/${created.student.id}`}>Open student profile</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreated(null)
                setDetails({ ...EMPTY_DETAILS })
                setEnrollment((prev) => ({ ...EMPTY_ENROLLMENT, academicSessionId: prev.academicSessionId }))
                setCreateAccount(false)
                setUsername('')
                router.refresh()
              }}
            >
              Add another student
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/admin/students">Back to the list</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  /* ---------------------------------------------------------------- */
  /* The form                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError ? <Alert variant="danger">{formError}</Alert> : null}

      {/* Admission */}
      <Card>
        <CardHeader>
          <CardTitle>Admission</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Student ID" hint="Generated automatically when you save.">
            <Input value={nextStudentCode ?? 'STU-…'} disabled readOnly className="font-mono" />
          </Field>

          <Field
            label="Admission number"
            htmlFor="admissionNumber"
            hint={`Leave blank to use ${nextAdmissionNumber ?? 'the next number'}.`}
            error={fieldErrors.admissionNumber}
          >
            <Input
              id="admissionNumber"
              value={details.admissionNumber}
              onChange={(e) => set('admissionNumber', e.target.value)}
              placeholder={nextAdmissionNumber ?? ''}
              className="font-mono"
              disabled={submitting}
            />
          </Field>

          <Field label="Admission date" htmlFor="admissionDate" required error={fieldErrors.admissionDate}>
            <Input
              id="admissionDate"
              type="date"
              value={details.admissionDate}
              onChange={(e) => set('admissionDate', e.target.value)}
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Personal */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
            <Input
              id="fullName"
              value={details.fullName}
              onChange={(e) => {
                set('fullName', e.target.value)
                if (createAccount && username === suggestUsername(details.fullName)) {
                  setUsername(suggestUsername(e.target.value))
                }
              }}
              placeholder="e.g. Muhammad Ali"
              disabled={submitting}
              autoFocus
            />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={fieldErrors.dateOfBirth}>
            <Input
              id="dateOfBirth"
              type="date"
              value={details.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Gender" htmlFor="gender" error={fieldErrors.gender}>
            <Select
              id="gender"
              value={details.gender}
              onChange={(e) => set('gender', e.target.value)}
              disabled={submitting}
            >
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field
            label="CNIC / B-Form number"
            htmlFor="cnicBformNumber"
            hint="Format: 12345-1234567-1"
            error={fieldErrors.cnicBformNumber}
          >
            <Input
              id="cnicBformNumber"
              value={details.cnicBformNumber}
              onChange={(e) => set('cnicBformNumber', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={submitting}
            />
          </Field>

          <Field label="Contact number" htmlFor="phone" hint="Format: 0300-1234567" error={fieldErrors.phone}>
            <Input
              id="phone"
              value={details.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0300-1234567"
              disabled={submitting}
            />
          </Field>

          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              value={details.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="City" htmlFor="city" error={fieldErrors.city}>
            <Input id="city" value={details.city} onChange={(e) => set('city', e.target.value)} disabled={submitting} />
          </Field>

          <Field label="Address" htmlFor="address" className="sm:col-span-2" error={fieldErrors.address}>
            <Textarea
              id="address"
              value={details.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Guardian */}
      <Card>
        <CardHeader>
          <CardTitle>Parent / guardian</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Father's name" htmlFor="fatherName" required error={fieldErrors.fatherName}>
            <Input
              id="fatherName"
              value={details.fatherName}
              onChange={(e) => set('fatherName', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Father's CNIC" htmlFor="fatherCnic" hint="Format: 12345-1234567-1" error={fieldErrors.fatherCnic}>
            <Input
              id="fatherCnic"
              value={details.fatherCnic}
              onChange={(e) => set('fatherCnic', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={submitting}
            />
          </Field>

          <Field label="Father's contact number" htmlFor="fatherPhone" error={fieldErrors.fatherPhone}>
            <Input
              id="fatherPhone"
              value={details.fatherPhone}
              onChange={(e) => set('fatherPhone', e.target.value)}
              placeholder="0300-1234567"
              disabled={submitting}
            />
          </Field>

          <Field label="Father's occupation" htmlFor="fatherOccupation" error={fieldErrors.fatherOccupation}>
            <Input
              id="fatherOccupation"
              value={details.fatherOccupation}
              onChange={(e) => set('fatherOccupation', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Mother's name" htmlFor="motherName" error={fieldErrors.motherName}>
            <Input
              id="motherName"
              value={details.motherName}
              onChange={(e) => set('motherName', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            label="Guardian's name"
            htmlFor="guardianName"
            hint="Only if different from the father."
            error={fieldErrors.guardianName}
          >
            <Input
              id="guardianName"
              value={details.guardianName}
              onChange={(e) => set('guardianName', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Guardian's relation" htmlFor="guardianRelation" error={fieldErrors.guardianRelation}>
            <Input
              id="guardianRelation"
              value={details.guardianRelation}
              onChange={(e) => set('guardianRelation', e.target.value)}
              placeholder="e.g. Uncle"
              disabled={submitting}
            />
          </Field>

          <Field label="Guardian's contact number" htmlFor="guardianPhone" error={fieldErrors.guardianPhone}>
            <Input
              id="guardianPhone"
              value={details.guardianPhone}
              onChange={(e) => set('guardianPhone', e.target.value)}
              placeholder="0300-1234567"
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Previous education */}
      <Card>
        <CardHeader>
          <CardTitle>Previous education</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Previous school / college" htmlFor="previousInstitution" error={fieldErrors.previousInstitution}>
            <Input
              id="previousInstitution"
              value={details.previousInstitution}
              onChange={(e) => set('previousInstitution', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Matric board" htmlFor="matricBoard" error={fieldErrors.matricBoard}>
            <Input
              id="matricBoard"
              value={details.matricBoard}
              onChange={(e) => set('matricBoard', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="10th (matric) roll number" htmlFor="matricRollNumber" error={fieldErrors.matricRollNumber}>
            <Input
              id="matricRollNumber"
              value={details.matricRollNumber}
              onChange={(e) => set('matricRollNumber', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Previous result (summary)" htmlFor="previousResultSummary" error={fieldErrors.previousResultSummary}>
            <Input
              id="previousResultSummary"
              value={details.previousResultSummary}
              onChange={(e) => set('previousResultSummary', e.target.value)}
              placeholder="e.g. Matric 2026 — A grade"
              disabled={submitting}
            />
          </Field>

          <Field label="Marks obtained" htmlFor="previousResultObtained" error={fieldErrors.previousResultObtained}>
            <Input
              id="previousResultObtained"
              type="number"
              inputMode="numeric"
              value={details.previousResultObtained}
              onChange={(e) => set('previousResultObtained', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Total marks" htmlFor="previousResultTotal" error={fieldErrors.previousResultTotal}>
            <Input
              id="previousResultTotal"
              type="number"
              inputMode="numeric"
              value={details.previousResultTotal}
              onChange={(e) => set('previousResultTotal', e.target.value)}
              placeholder="e.g. 1100"
              disabled={submitting}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Enrollment */}
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Academic enrollment</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">
              Where the student will sit. Only combinations that exist in the chosen session are
              offered.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <EnrollmentPicker
            sessions={sessions}
            groups={groups}
            value={enrollment}
            onChange={setEnrollment}
            loading={loading}
            disabled={submitting}
            errors={fieldErrors}
          />
        </CardContent>
      </Card>

      {/* Portal account */}
      <Card>
        <CardHeader>
          <CardTitle>Student portal account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Checkbox
            label="Create a student portal account"
            description="Lets the student sign in to see their own attendance, timetable and results. You can also add this later."
            checked={createAccount}
            onChange={(e) => {
              setCreateAccount(e.target.checked)
              if (e.target.checked && !username) setUsername(suggestUsername(details.fullName))
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
                placeholder="e.g. muhammad.ali"
                className="font-mono"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2 pb-4">
        <Button type="button" variant="secondary" asChild disabled={submitting}>
          <Link href="/admin/students">Cancel</Link>
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? (
            'Saving…'
          ) : (
            <>
              <Save className="h-4 w-4" />
              Admit student
            </>
          )}
        </Button>
      </div>

      <p className="flex items-center justify-end gap-1.5 pb-6 text-xs text-foreground-subtle">
        <CheckCircle2 className="h-3.5 w-3.5" />
        The student ID and admission number are assigned by the system.
      </p>
    </form>
  )
}

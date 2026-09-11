'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { FeeLinesEditor, emptyFeeLines, feeLinesPayload, type FeeLineDraft } from '@/features/fees/fee-lines-editor'
import { AdmissionDocuments, uploadAdmissionFiles, type AdmissionDocumentType, type AdmissionFiles } from './admission-documents'
import { studentCreateSchema } from '@/validation/students'
import { StudentDetailsFields } from './student-details-fields'
import {
  EMPTY_STUDENT_DETAILS,
  studentDetailsPayload,
  type StudentDetailsValue,
} from './student-details'
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

const EMPTY_DETAILS: StudentDetailsValue = {
  ...EMPTY_STUDENT_DETAILS,
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
  documentTypes,
}: {
  sessions: SessionOption[]
  defaultSessionId: string
  nextStudentCode: string | null
  nextAdmissionNumber: string | null
  /** The college's document checklist, so files can be attached at the counter. */
  documentTypes: AdmissionDocumentType[]
}) {
  const router = useRouter()

  const [details, setDetails] = React.useState(EMPTY_DETAILS)
  const [feeLines, setFeeLines] = React.useState<FeeLineDraft[]>(emptyFeeLines)
  const [feeDiscount, setFeeDiscount] = React.useState('')
  const [documentFiles, setDocumentFiles] = React.useState<AdmissionFiles>({})
  const [uploadFailures, setUploadFailures] = React.useState<string[]>([])
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
    return {
      ...studentDetailsPayload(details),
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
      // The year's fee, head by head. Every head is optional, so only the
      // ones the office filled in are sent.
      fee: { lines: feeLinesPayload(feeLines), feeDiscountPaisa: feeDiscount || 0 },
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

      // The files could not be attached until the record existed. An upload
      // that fails does not undo the admission; the office is told which one
      // to try again on the student's page.
      const failed = await uploadAdmissionFiles(result.student.id, documentFiles)
      setUploadFailures(failed)

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

          {uploadFailures.length > 0 ? (
            <Alert variant="warning" title="Some documents did not upload">
              {uploadFailures.join(', ')} could not be attached. The admission is saved; try again from the student&apos;s page.
            </Alert>
          ) : null}

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
                setFeeLines(emptyFeeLines())
                setFeeDiscount('')
                setDocumentFiles({})
                setUploadFailures([])
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

      <StudentDetailsFields
        value={details}
        onChange={(next) => {
          // The username follows the name only while the office has not typed
          // its own; once they have, it is theirs.
          if (createAccount && next.fullName !== details.fullName && username === suggestUsername(details.fullName)) {
            setUsername(suggestUsername(next.fullName))
          }
          setDetails(next)
        }}
        errors={fieldErrors}
        disabled={submitting}
        admission={{ mode: 'create', nextStudentCode, nextAdmissionNumber }}
        autoFocus
      />

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

      {/* Fees for the year */}
      <Card>
        <CardHeader>
          <CardTitle>Fees for the year</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeLinesEditor
            lines={feeLines}
            onChange={setFeeLines}
            disabled={submitting}
            discount={feeDiscount}
            onDiscountChange={setFeeDiscount}
          />
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmissionDocuments types={documentTypes} files={documentFiles} onChange={setDocumentFiles} disabled={submitting} />
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

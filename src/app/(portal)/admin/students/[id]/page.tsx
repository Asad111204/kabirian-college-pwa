import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, Clock, FileText } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getStudent } from '@/server/services/students.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { NotFoundError } from '@/server/api/errors'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { ENROLLMENT_STATUS_LABEL, STUDENT_STATUS_LABEL } from '@/validation/students'
import { StudentActions } from '@/features/students/student-actions'
import { DocumentPanel } from '@/features/documents/document-panel'
import { getStudentDocuments, isDocumentStorageReady } from '@/server/services/documents.service'
import { can } from '@/server/auth/context'

export const metadata: Metadata = { title: 'Student profile' }
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  LEFT: 'danger',
  GRADUATED: 'info',
  TRANSFERRED_OUT: 'warning',
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let student
  try {
    student = await getStudent(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const sessions = await listAcademicSessions(ctx)
  const current = student.placement

  const [documents, storageReady] = await Promise.all([
    getStudentDocuments(ctx, id),
    isDocumentStorageReady(),
  ])

  const currentLabel = current
    ? `${current.sessionName} · ${current.className} · ${current.divisionName} · ${current.programName} · Section ${current.sectionName}${current.rollNumber ? ` · Roll ${current.rollNumber}` : ''}`
    : null

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href="/admin/students">
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </Link>
      </Button>

      <PageHeader
        title={student.fullName}
        description={`${student.studentCode} · Admission ${student.admissionNumber}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[student.status] ?? 'neutral'}>
              {STUDENT_STATUS_LABEL[student.status] ?? student.status}
            </Badge>
            {student.account ? (
              <Badge variant="info">{student.account.username}</Badge>
            ) : (
              <Badge variant="neutral">No portal account</Badge>
            )}
          </div>
        }
      />

      {!current ? (
        <Alert variant="warning" className="mb-4" title="Not currently enrolled">
          This student has no active enrollment. Their history is below.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------------ */}
        {/* Left: the record                                              */}
        {/* ------------------------------------------------------------ */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Current enrollment</CardTitle>
            </CardHeader>
            <CardContent>
              {current ? (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Detail label="Academic session" value={current.sessionName} />
                  <Detail label="Class / Year" value={current.className} />
                  <Detail label="Division" value={current.divisionName} />
                  <Detail label="Program" value={current.programName} />
                  <Detail label="Section" value={current.sectionName} />
                  <Detail label="Roll number" value={current.rollNumber ?? '—'} />
                  <Detail label="Enrolled from" value={formatDate(current.startDate)} />
                </dl>
              ) : (
                <p className="text-sm text-foreground-muted">No active enrollment.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Full name" value={student.fullName} />
                <Detail label="Date of birth" value={formatDate(student.dateOfBirth)} />
                <Detail label="Gender" value={student.gender ?? '—'} />
                <Detail label="CNIC / B-Form" value={student.cnicBformNumber ?? '—'} />
                <Detail label="Contact number" value={student.phone ?? '—'} />
                <Detail label="Email" value={student.email ?? '—'} />
                <Detail label="City" value={student.city ?? '—'} />
                <Detail label="Address" value={student.address ?? '—'} className="sm:col-span-2" />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parent / guardian</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Father's name" value={student.fatherName} />
                <Detail label="Father's CNIC" value={student.fatherCnic ?? '—'} />
                <Detail label="Father's contact" value={student.fatherPhone ?? '—'} />
                <Detail label="Father's occupation" value={student.fatherOccupation ?? '—'} />
                <Detail label="Mother's name" value={student.motherName ?? '—'} />
                <Detail label="Guardian" value={student.guardianName ?? '—'} />
                <Detail label="Guardian relation" value={student.guardianRelation ?? '—'} />
                <Detail label="Guardian contact" value={student.guardianPhone ?? '—'} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admission & previous education</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Student ID" value={student.studentCode} mono />
                <Detail label="Admission number" value={student.admissionNumber} mono />
                <Detail label="Admission date" value={formatDate(student.admissionDate)} />
                <Detail label="Admitted in session" value={student.admissionSessionName} />
                <Detail label="Previous institution" value={student.previousInstitution ?? '—'} />
                <Detail label="Matric board" value={student.matricBoard ?? '—'} />
                <Detail label="10th roll number" value={student.matricRollNumber ?? '—'} />
                <Detail
                  label="Previous result"
                  value={
                    student.previousResultObtained && student.previousResultTotal
                      ? `${student.previousResultObtained} / ${student.previousResultTotal}`
                      : (student.previousResultSummary ?? '—')
                  }
                />
              </dl>
            </CardContent>
          </Card>

          {/* Academic history — the point of the enrollment model */}
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Academic history</CardTitle>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  Every placement this student has had. Nothing is ever overwritten.
                </p>
              </div>
              <Badge variant="neutral">{student.history.length}</Badge>
            </CardHeader>
            <CardContent>
              {student.history.length === 0 ? (
                <p className="text-sm text-foreground-muted">No enrollment records yet.</p>
              ) : (
                <ol className="space-y-3">
                  {student.history.map((entry) => (
                    <li
                      key={entry.enrollmentId}
                      className={`flex gap-3 rounded-[var(--radius-control)] border p-3 ${
                        entry.status === 'ACTIVE' ? 'border-primary bg-brand-50' : 'border-border'
                      }`}
                    >
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{entry.sessionName}</p>
                          <Badge variant={entry.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {ENROLLMENT_STATUS_LABEL[entry.status] ?? entry.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground-muted">
                          {entry.className} · {entry.divisionName} · {entry.programName} · Section{' '}
                          {entry.sectionName}
                          {entry.rollNumber ? ` · Roll ${entry.rollNumber}` : ''}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          {formatDate(entry.startDate)}
                          {entry.endDate ? ` → ${formatDate(entry.endDate)}` : ' → present'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Right: actions and future modules                             */}
        {/* ------------------------------------------------------------ */}
        <div className="space-y-4">
          <StudentActions
            student={{
              id: student.id,
              fullName: student.fullName,
              studentCode: student.studentCode,
              status: student.status,
              hasAccount: student.account !== null,
              accountUsername: student.account?.username ?? null,
              currentSessionId: current?.sessionId ?? null,
              currentPlacementLabel: currentLabel,
            }}
            sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
          />

          {/* Subjects come from the curriculum, never from a list on the student */}
          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
            </CardHeader>
            <CardContent>
              {!current ? (
                <p className="text-sm text-foreground-muted">
                  Subjects appear once the student is enrolled.
                </p>
              ) : student.currentSubjects.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No curriculum set"
                  description={`No subjects have been chosen for ${current.className} · ${current.programName} yet.`}
                  action={
                    <Button size="sm" variant="secondary" asChild>
                      <Link href="/admin/academics/curriculum">Set the curriculum</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-1.5">
                  {student.currentSubjects.map((subject) => (
                    <li
                      key={subject.id}
                      className="flex items-center justify-between rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm"
                    >
                      <span>{subject.name}</span>
                      {subject.code ? (
                        <code className="text-xs text-foreground-muted">{subject.code}</code>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {student.account ? (
            <Card>
              <CardHeader>
                <CardTitle>Portal account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <dl className="space-y-2">
                  <Detail label="Username" value={student.account.username} mono />
                  <Detail label="Account status" value={student.account.isActive ? 'Active' : 'Inactive'} />
                </dl>
                <Button variant="secondary" size="sm" asChild className="w-full">
                  <Link href={`/admin/users/${student.account.userId}`}>Manage the account</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Modules that genuinely do not exist yet */}
          <DocumentPanel
            slots={documents}
            ownerEndpoint={`/api/v1/students/${student.id}/documents`}
            canManage={can(ctx, 'documents.upload')}
            storageReady={storageReady}
          />

          <Card>
            <CardHeader>
              <CardTitle>Not built yet</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  { name: 'Attendance', phase: 7, detail: 'Daily record and percentage' },
                  { name: 'Exams & marks', phase: 8, detail: 'Exam schedule and marks' },
                  { name: 'Results', phase: 9, detail: 'Grades and result cards' },
                ].map((module) => (
                  <li
                    key={module.name}
                    className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-dashed border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
                        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {module.name}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground-subtle">{module.detail}</p>
                    </div>
                    <Badge variant="neutral" className="shrink-0">
                      Phase {module.phase}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

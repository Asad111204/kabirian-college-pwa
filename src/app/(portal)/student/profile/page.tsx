import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError } from '@/server/api/errors'
import { getMyStudentProfile } from '@/server/services/students.service'
import { getStudentDocuments, isDocumentStorageReady } from '@/server/services/documents.service'
import { DocumentPanel } from '@/features/documents/document-panel'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Alert } from '@/components/ui/feedback'
import { formatDate } from '@/lib/format'
import { STUDENT_STATUS_LABEL } from '@/validation/students'

export const metadata: Metadata = { title: 'My profile' }
export const dynamic = 'force-dynamic'

/**
 * The student's own record.
 *
 * Everything here is a fact about them that the college already holds, so
 * nothing is withheld — their B-Form number, their father's CNIC, their
 * previous board result. It is read with the student id on their session
 * rather than one from the URL, so there is no parameter to tamper with.
 *
 * They cannot edit any of it. What they *can* do is hand in a document the
 * college is still missing, once, which is the only part of this page that
 * writes anything.
 */
export default async function StudentProfilePage() {
  const ctx = await requirePortalAccess(['STUDENT'])

  let student
  try {
    student = await getMyStudentProfile(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My profile" />
          <Alert variant="warning" title="This login is not linked to a student record">
            The school office needs to connect this login to your student record before your
            profile can be shown.
          </Alert>
        </>
      )
    }
    throw error
  }

  const [documents, storageReady] = await Promise.all([
    getStudentDocuments(ctx, student.id),
    isDocumentStorageReady(),
  ])

  const place = student.placement

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={`${student.studentCode} · Admission ${student.admissionNumber}`}
        actions={
          <Badge variant={student.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {STUDENT_STATUS_LABEL[student.status] ?? student.status}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Avatar
              name={student.fullName}
              src={student.photoId ? `/api/v1/documents/${student.photoId}/content` : null}
              size="xl"
            />
            <div>
              <p className="text-base font-semibold">{student.fullName}</p>
              <p className="text-sm text-foreground-muted">{student.fatherName}</p>
            </div>
            {place ? (
              <p className="text-sm">
                {place.className} · {place.divisionName} · {place.programName}
                <span className="block text-foreground-muted">Section {place.sectionName}</span>
              </p>
            ) : (
              <p className="text-sm text-foreground-muted">Not placed in a class yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Date of birth" value={formatDate(student.dateOfBirth)} />
              <Detail label="Gender" value={student.gender ?? '—'} />
              <Detail label="B-Form / CNIC" value={student.cnicBformNumber ?? '—'} mono />
              <Detail label="Contact number" value={student.phone ?? '—'} />
              <Detail label="Email" value={student.email ?? '—'} />
              <Detail label="Address" value={student.address ?? '—'} className="sm:col-span-2" />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Family</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Father's name" value={student.fatherName} />
              <Detail label="Father's CNIC" value={student.fatherCnic ?? '—'} mono />
              <Detail label="Father's contact" value={student.fatherPhone ?? '—'} />
              <Detail label="Father's occupation" value={student.fatherOccupation ?? '—'} />
              <Detail label="Mother's name" value={student.motherName ?? '—'} />
              <Detail
                label="Guardian"
                value={
                  student.guardianName
                    ? `${student.guardianName}${student.guardianRelation ? ` (${student.guardianRelation})` : ''}`
                    : '—'
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Admission</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-y-3">
              <Detail label="Admitted on" value={formatDate(student.admissionDate)} />
              <Detail label="Admission session" value={student.admissionSessionName} />
              <Detail label="Roll number" value={place?.rollNumber ?? '—'} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Before joining</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Previous institution" value={student.previousInstitution ?? '—'} />
              <Detail label="Previous result" value={student.previousResultSummary ?? '—'} />
              <Detail
                label="Marks"
                value={
                  student.previousResultObtained !== null && student.previousResultTotal !== null
                    ? `${student.previousResultObtained} / ${student.previousResultTotal}`
                    : '—'
                }
              />
              <Detail label="Matric roll number" value={student.matricRollNumber ?? '—'} mono />
            </dl>
          </CardContent>
        </Card>

        {student.currentSubjects.length > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>My subjects</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {student.currentSubjects.map((subject) => (
                  <li key={subject.id}>
                    <Badge variant="neutral">{subject.name}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="lg:col-span-3">
          <DocumentPanel
            slots={documents}
            ownerEndpoint={`/api/v1/students/${student.id}/documents`}
            canManage={false}
            selfService
            storageReady={storageReady}
          />
        </div>
      </div>

      <Alert variant="info" className="mt-4">
        To correct anything on this page, please contact the school office — student records are
        maintained by the administration.
      </Alert>
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

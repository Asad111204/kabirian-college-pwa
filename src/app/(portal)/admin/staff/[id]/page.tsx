import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, ShieldCheck, Users } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getStaff } from '@/server/services/staff.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { NotFoundError } from '@/server/api/errors'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { EMPLOYMENT_STATUS_LABEL, STAFF_TYPE_LABEL } from '@/validation/staff'
import { CloseAssignmentButton, StaffActions } from '@/features/staff/staff-actions'
import { DocumentPanel } from '@/features/documents/document-panel'
import { getStaffDocuments, isDocumentStorageReady } from '@/server/services/documents.service'
import { can } from '@/server/auth/context'

export const metadata: Metadata = { title: 'Staff profile' }
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  INACTIVE: 'neutral',
  RESIGNED: 'danger',
  RETIRED: 'info',
  TERMINATED: 'danger',
  LEFT: 'neutral',
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let staff
  try {
    staff = await getStaff(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const sessions = await listAcademicSessions(ctx)

  const [documents, storageReady] = await Promise.all([
    getStaffDocuments(ctx, id),
    isDocumentStorageReady(),
  ])

  const activeAssignments = staff.assignments.filter((a) => a.isActive)
  const pastAssignments = staff.assignments.filter((a) => !a.isActive)
  const activeIncharges = staff.incharges.filter((i) => i.isActive)
  const pastIncharges = staff.incharges.filter((i) => !i.isActive)

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href="/admin/staff">
          <ArrowLeft className="h-4 w-4" />
          Back to staff
        </Link>
      </Button>

      <PageHeader
        title={staff.fullName}
        description={`${staff.staffCode} · ${staff.designation}${staff.department ? ` · ${staff.department}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[staff.employmentStatus] ?? 'neutral'}>
              {EMPLOYMENT_STATUS_LABEL[staff.employmentStatus] ?? staff.employmentStatus}
            </Badge>
            <Badge variant="neutral">{STAFF_TYPE_LABEL[staff.staffType] ?? staff.staffType}</Badge>
            {staff.account ? (
              <Badge variant="info">{staff.account.username}</Badge>
            ) : (
              <Badge variant="neutral">No portal account</Badge>
            )}
          </div>
        }
      />

      {staff.employmentStatus !== 'ACTIVE' && staff.employmentStatus !== 'ON_LEAVE' ? (
        <Alert variant="warning" className="mb-4" title="No longer employed">
          Their assignments and in-charge roles were closed, so they can no longer see any students.
          Every record is kept below.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Employment information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Staff ID" value={staff.staffCode} mono />
                <Detail label="Designation" value={staff.designation} />
                <Detail label="Department" value={staff.department ?? '—'} />
                <Detail label="Staff type" value={STAFF_TYPE_LABEL[staff.staffType] ?? staff.staffType} />
                <Detail label="Joining date" value={formatDate(staff.joiningDate)} />
                <Detail
                  label="Status"
                  value={EMPLOYMENT_STATUS_LABEL[staff.employmentStatus] ?? staff.employmentStatus}
                />
                {staff.leavingDate ? (
                  <Detail label="Last working day" value={formatDate(staff.leavingDate)} />
                ) : null}
                <Detail label="Qualification" value={staff.qualification ?? '—'} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Full name" value={staff.fullName} />
                <Detail label="Father's / husband's name" value={staff.fatherOrHusbandName ?? '—'} />
                <Detail label="Date of birth" value={formatDate(staff.dateOfBirth)} />
                <Detail label="Gender" value={staff.gender ?? '—'} />
                <Detail label="CNIC" value={staff.cnicNumber ?? '—'} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Contact number" value={staff.phone ?? '—'} />
                <Detail label="Email" value={staff.email ?? '—'} />
                <Detail label="Address" value={staff.address ?? '—'} className="sm:col-span-2" />
              </dl>
            </CardContent>
          </Card>

          {/* Teaching assignments */}
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Teaching assignments</CardTitle>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  Each one grants access to that section&apos;s students.
                </p>
              </div>
              <Badge variant={activeAssignments.length > 0 ? 'brand' : 'neutral'}>
                {activeAssignments.length} active
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeAssignments.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No subjects assigned"
                  description="Use “Assign a subject” to give this teacher a class."
                />
              ) : (
                <ul className="space-y-2">
                  {activeAssignments.map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{assignment.subjectName}</p>
                        <p className="text-xs text-foreground-muted">
                          {assignment.sessionName} · {assignment.className} · {assignment.divisionName} ·{' '}
                          {assignment.programName} · Section {assignment.sectionName}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          Since {formatDate(assignment.assignedAt)}
                        </p>
                      </div>
                      <CloseAssignmentButton
                        staffId={staff.id}
                        id={assignment.id}
                        kind="assignment"
                        label={`${assignment.subjectName} · Section ${assignment.sectionName}`}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {pastAssignments.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    Past assignments ({pastAssignments.length})
                  </p>
                  <ul className="space-y-1.5">
                    {pastAssignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="rounded-[var(--radius-control)] border border-dashed border-border p-2.5 text-sm opacity-75"
                      >
                        <p className="text-foreground-muted">
                          {assignment.subjectName} — {assignment.className} · {assignment.divisionName} ·{' '}
                          {assignment.programName} · Section {assignment.sectionName}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          {formatDate(assignment.assignedAt)} → {formatDate(assignment.endedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Section in-charge */}
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Section in-charge</CardTitle>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  Responsibility for a whole section, not just one subject.
                </p>
              </div>
              <Badge variant={activeIncharges.length > 0 ? 'brand' : 'neutral'}>
                {activeIncharges.length} active
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeIncharges.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Not in charge of any section"
                  description="A section can have one in-charge at a time."
                />
              ) : (
                <ul className="space-y-2">
                  {activeIncharges.map((incharge) => (
                    <li
                      key={incharge.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {incharge.className} · {incharge.divisionName} · {incharge.programName} · Section{' '}
                          {incharge.sectionName}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {incharge.sessionName} · {incharge.studentCount} student
                          {incharge.studentCount === 1 ? '' : 's'} · since {formatDate(incharge.assignedAt)}
                        </p>
                      </div>
                      <CloseAssignmentButton
                        staffId={staff.id}
                        id={incharge.id}
                        kind="incharge"
                        label={`Section ${incharge.sectionName}`}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {pastIncharges.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    Past in-charge roles ({pastIncharges.length})
                  </p>
                  <ul className="space-y-1.5">
                    {pastIncharges.map((incharge) => (
                      <li
                        key={incharge.id}
                        className="rounded-[var(--radius-control)] border border-dashed border-border p-2.5 text-sm opacity-75"
                      >
                        <p className="text-foreground-muted">
                          {incharge.className} · {incharge.divisionName} · {incharge.programName} · Section{' '}
                          {incharge.sectionName}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          {formatDate(incharge.assignedAt)} → {formatDate(incharge.endedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <StaffActions
            staff={{
              id: staff.id,
              fullName: staff.fullName,
              staffCode: staff.staffCode,
              staffType: staff.staffType,
              employmentStatus: staff.employmentStatus,
              hasAccount: staff.account !== null,
              accountUsername: staff.account?.username ?? null,
            }}
            sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>Student access</CardTitle>
            </CardHeader>
            <CardContent>
              {activeAssignments.length === 0 && activeIncharges.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-foreground-muted">
                  <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  With no active assignments, this teacher can see <strong>no students at all</strong>.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-foreground-muted">
                    Through their assignments, they can see students in:
                  </p>
                  <ul className="space-y-1">
                    {[
                      ...new Map(
                        [...activeAssignments, ...activeIncharges].map((item) => [
                          item.sectionId,
                          `${item.className} · ${item.divisionName} · ${item.programName} · Section ${item.sectionName}`,
                        ]),
                      ).values(),
                    ].map((label) => (
                      <li key={label} className="text-sm text-foreground">
                        {label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-foreground-subtle">
                    They see names, roll numbers and placement only — never CNICs, addresses or
                    guardian details.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {staff.account ? (
            <Card>
              <CardHeader>
                <CardTitle>Portal account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <dl className="space-y-2">
                  <Detail label="Username" value={staff.account.username} mono />
                  <Detail label="Account status" value={staff.account.isActive ? 'Active' : 'Inactive'} />
                </dl>
                <Button variant="secondary" size="sm" asChild className="w-full">
                  <Link href={`/admin/users/${staff.account.userId}`}>Manage the account</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <DocumentPanel
            slots={documents}
            ownerEndpoint={`/api/v1/staff/${staff.id}/documents`}
            canManage={can(ctx, 'documents.upload')}
            storageReady={storageReady}
          />
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

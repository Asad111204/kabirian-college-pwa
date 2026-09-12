import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyProfile } from '@/server/services/staff-portal.service'
import { getMyStaffAttendance } from '@/server/services/staff-attendance.service'
import { MyAttendanceCard } from '@/features/staff-attendance/my-attendance-card'
import { DocumentPanel } from '@/features/documents/document-panel'
import { getStaffDocuments, isDocumentStorageReady } from '@/server/services/documents.service'
import { ForbiddenError } from '@/server/api/errors'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { EMPLOYMENT_STATUS_LABEL, STAFF_TYPE_LABEL } from '@/validation/staff'

export const metadata: Metadata = { title: 'My profile' }
export const dynamic = 'force-dynamic'

/** The teacher's own record. Their own details, so nothing is withheld. */
export default async function MyProfilePage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let profile
  try {
    profile = await getMyProfile(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My profile" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The school office needs to connect this login to your staff record first.
          </Alert>
        </>
      )
    }
    throw error
  }

  // Their own register for this month, read with their own id and nobody else's.
  const attendance = await getMyStaffAttendance(ctx, {})

  // Their own papers. They may hand in one the college is missing; changing or
  // removing one that is already on file is the office's.
  const [documents, storageReady] = await Promise.all([
    getStaffDocuments(ctx, profile.id),
    isDocumentStorageReady(),
  ])

  return (
    <>
      <PageHeader
        title={profile.fullName}
        description={`${profile.staffCode} · ${profile.designation}`}
        actions={
          <Badge variant="success">
            {EMPLOYMENT_STATUS_LABEL[profile.employmentStatus] ?? profile.employmentStatus}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Staff ID" value={profile.staffCode} mono />
              <Detail label="Designation" value={profile.designation} />
              <Detail label="Department" value={profile.department ?? '—'} />
              <Detail
                label="Staff type"
                value={STAFF_TYPE_LABEL[profile.staffType] ?? profile.staffType}
              />
              <Detail label="Joining date" value={formatDate(profile.joiningDate)} />
              <Detail label="Qualification" value={profile.qualification ?? '—'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal &amp; contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Father&apos;s / husband&apos;s name" value={profile.fatherOrHusbandName ?? '—'} />
              <Detail label="Date of birth" value={formatDate(profile.dateOfBirth)} />
              <Detail label="CNIC" value={profile.cnicNumber ?? '—'} />
              <Detail label="Contact number" value={profile.phone ?? '—'} />
              <Detail label="Email" value={profile.email ?? '—'} />
              <Detail label="Address" value={profile.address ?? '—'} className="sm:col-span-2" />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <MyAttendanceCard attendance={attendance} />
      </div>

      <div className="mt-4">
        <DocumentPanel
          slots={documents}
          ownerEndpoint={`/api/v1/staff/${profile.id}/documents`}
          canManage={false}
          selfService
          storageReady={storageReady}
        />
      </div>

      <Alert variant="info" className="mt-4">
        To correct anything here, please contact the school office — staff records are maintained by
        the administration.
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

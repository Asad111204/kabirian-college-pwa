import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { authorize, requirePortalAccess } from '@/server/auth/context'
import { getStaff } from '@/server/services/staff.service'
import { listDepartments, listDesignations } from '@/server/services/reference-data.service'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { EditStaffForm } from '@/features/staff/edit-staff-form'
import { staffDetailsFrom } from '@/features/staff/staff-details'

export const metadata: Metadata = { title: 'Edit staff' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Staff → one staff member → Edit.
 *
 * `staff.update` is required to open the page at all, so somebody without it
 * gets the 403 page rather than a form that fails on save. The API checks it
 * again — this is the courtesy, not the lock.
 */
export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  authorize(ctx, 'staff.update')

  const { id } = await params

  let staff
  try {
    staff = await getStaff(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [designations, departments] = await Promise.all([listDesignations(ctx), listDepartments(ctx)])

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href={`/admin/staff/${staff.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to {staff.fullName}
        </Link>
      </Button>

      <PageHeader
        title={`Edit ${staff.fullName}`}
        description={`${staff.staffCode} · every detail the college holds about this staff member`}
      />

      <EditStaffForm
        staffId={staff.id}
        staffCode={staff.staffCode}
        initial={staffDetailsFrom(staff)}
        designations={designations.map((d) => ({ id: d.id, name: d.name, isTeaching: d.isTeaching }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />
    </>
  )
}

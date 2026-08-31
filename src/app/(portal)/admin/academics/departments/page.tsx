import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listDepartments } from '@/server/services/reference-data.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { DepartmentsManager } from '@/features/academics/departments-manager'

export const metadata: Metadata = { title: 'Departments' }
export const dynamic = 'force-dynamic'

export default async function DepartmentsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const departments = await listDepartments(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Departments"
        description="The departments staff belong to — Biology, Physics, Administration and so on."
      />

      <DepartmentsManager items={departments} />

      <Alert variant="info" className="mt-4">
        A department with staff in it cannot be deleted — deactivate it instead.
      </Alert>
    </>
  )
}

import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listStaff } from '@/server/services/staff.service'
import { listDepartments, listDesignations } from '@/server/services/reference-data.service'
import { staffListQuerySchema } from '@/validation/staff'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { StaffTable } from '@/features/staff/staff-table'

export const metadata: Metadata = { title: 'Staff' }
export const dynamic = 'force-dynamic'

/**
 * Admin -> Staff. Guarded on the server twice over: the portal layout requires
 * the ADMIN role, and every service call checks `staff.view` and the role again.
 */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  const parsed = staffListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : staffListQuerySchema.parse({})

  const [result, departments, designations] = await Promise.all([
    listStaff(ctx, query),
    listDepartments(ctx),
    listDesignations(ctx),
  ])

  return (
    <>
      <PageHeader
        title="Staff"
        description="Teachers and other staff members, their assignments and their portal accounts."
      />

      <StaffTable
        staff={result.items.map((member) => ({
          ...member,
          joiningDate: member.joiningDate.toISOString(),
          account: member.account
            ? { username: member.account.username, isActive: member.account.isActive }
            : null,
        }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        counts={result.counts}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        designations={designations.map((d) => ({ id: d.id, name: d.name }))}
        filters={{
          search: query.search ?? '',
          departmentId: query.departmentId ?? '',
          designationId: query.designationId ?? '',
          staffType: query.staffType,
          status: query.status,
          account: query.account,
          sort: query.sort,
          direction: query.direction,
        }}
      />

      <Alert variant="info" className="mt-4">
        Staff records are never deleted. Teaching assignments refer to them, so someone who leaves
        has their status changed instead — their assignments close and their history stays intact.
      </Alert>
    </>
  )
}

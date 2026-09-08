import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listComplaints } from '@/server/services/complaints.service'
import { complaintListQuerySchema } from '@/validation/complaints'
import { PageHeader } from '@/components/layout/app-shell'
import { ComplaintList } from '@/features/complaints/complaint-list'

export const metadata: Metadata = { title: 'Complaints' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Complaints. Every application students have written, the ones
 * waiting on the office first when that filter is on.
 */
export default async function AdminComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = complaintListQuerySchema.safeParse(params)
  const page = await listComplaints(ctx, parsed.success ? parsed.data : complaintListQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="Complaints" description="Applications students have written to the office. Nobody but the office and the student who wrote one can read it." />
      <ComplaintList page={page} mine={false} basePath="/admin/complaints" />
    </>
  )
}

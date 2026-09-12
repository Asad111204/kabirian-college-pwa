import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listMyComplaints } from '@/server/services/complaints.service'
import { myComplaintsQuerySchema } from '@/validation/complaints'
import { PageHeader } from '@/components/layout/app-shell'
import { ComplaintList } from '@/features/complaints/complaint-list'

export const metadata: Metadata = { title: 'Write to the office' }
export const dynamic = 'force-dynamic'

/**
 * Student → Write to the office. Their own applications and nobody else's:
 * the list is read from the signed-in student's record on the server.
 */
export default async function StudentComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const params = await searchParams
  const parsed = myComplaintsQuerySchema.safeParse(params)
  const page = await listMyComplaints(ctx, parsed.success ? parsed.data : myComplaintsQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="Write to the office" description="Applications you have sent to the college office, and what they said back." />
      <ComplaintList page={page} mine basePath="/student/complaints" />
    </>
  )
}

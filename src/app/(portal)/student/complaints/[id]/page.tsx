import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/server/auth/context'
import { getComplaint } from '@/server/services/complaints.service'
import { NotFoundError } from '@/server/api/errors'
import { uuid } from '@/validation/common'
import { PageHeader } from '@/components/layout/app-shell'
import { ComplaintThread } from '@/features/complaints/complaint-thread'

export const metadata: Metadata = { title: 'Your application' }
export const dynamic = 'force-dynamic'

export default async function StudentComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const { id } = await params
  if (!uuid.safeParse(id).success) notFound()

  let complaint
  try {
    complaint = await getComplaint(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  return (
    <>
      <PageHeader title="Your application" description="Only you and the college office can read this." />
      <ComplaintThread complaint={complaint} />
    </>
  )
}

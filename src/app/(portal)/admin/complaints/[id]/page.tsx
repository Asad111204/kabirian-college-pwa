import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/server/auth/context'
import { getComplaint } from '@/server/services/complaints.service'
import { NotFoundError } from '@/server/api/errors'
import { uuid } from '@/validation/common'
import { PageHeader } from '@/components/layout/app-shell'
import { ComplaintThread } from '@/features/complaints/complaint-thread'

export const metadata: Metadata = { title: 'Application' }
export const dynamic = 'force-dynamic'

export default async function AdminComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
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
      <PageHeader title="Application" description="Read it, answer it, and mark it resolved when it is done." />
      <ComplaintThread complaint={complaint} />
    </>
  )
}

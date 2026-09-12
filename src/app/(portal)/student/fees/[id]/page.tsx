import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/server/auth/context'
import { getVoucher } from '@/server/services/fees.service'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { NotFoundError } from '@/server/api/errors'
import { uuid } from '@/validation/common'
import { PageHeader } from '@/components/layout/app-shell'
import { VoucherDetailScreen } from '@/features/fees/voucher-detail'

export const metadata: Metadata = { title: 'Fee voucher' }
export const dynamic = 'force-dynamic'

/**
 * A student's own voucher. The same screen the office sees, without the
 * office's buttons — what may be done comes from the server, not from which
 * page it is rendered on.
 */
export default async function StudentVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const { id } = await params
  if (!uuid.safeParse(id).success) notFound()

  let voucher
  try {
    voucher = await getVoucher(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  return (
    <>
      <PageHeader title="Fee voucher" description="Fees are paid at the school office." />
      <VoucherDetailScreen voucher={voucher} today={todayInCollegeTimezone()} printBase="/student/fees" />
    </>
  )
}

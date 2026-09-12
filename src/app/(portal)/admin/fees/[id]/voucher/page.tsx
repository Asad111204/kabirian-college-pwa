import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/server/auth/context'
import { getVoucher } from '@/server/services/fees.service'
import { env } from '@/server/config/env'
import { NotFoundError } from '@/server/api/errors'
import { uuid } from '@/validation/common'
import { PageHeader } from '@/components/layout/app-shell'
import { VoucherPrint } from '@/features/fees/voucher-print'

export const metadata: Metadata = { title: 'Fee voucher' }
export const dynamic = 'force-dynamic'

/** The printable voucher: three copies on one A4 sheet, saved as PDF by the browser. */
export default async function VoucherPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
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
      <div className="print-hide">
        <PageHeader title="Fee voucher" description="Three copies on one page: bank, college and student." />
      </div>
      <VoucherPrint voucher={voucher} collegeName={env.APP_COLLEGE_NAME} />
    </>
  )
}

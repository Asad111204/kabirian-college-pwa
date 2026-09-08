import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getFeeMonthSummary, listVouchers } from '@/server/services/fees.service'
import { monthStart } from '@/server/fees/fees-policy'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { voucherListQuerySchema } from '@/validation/fees'
import { PageHeader } from '@/components/layout/app-shell'
import { VoucherListScreen } from '@/features/fees/voucher-list'

export const metadata: Metadata = { title: 'Fees' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Fees. One month at a time: what was billed, what came in, and what
 * is still owed.
 */
export default async function AdminFeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = voucherListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : voucherListQuerySchema.parse({})
  const month = monthStart(query.month ?? todayInCollegeTimezone())

  const [page, summary] = await Promise.all([listVouchers(ctx, { ...query, month }), getFeeMonthSummary(ctx, month)])

  return (
    <>
      <PageHeader
        title="Fees"
        description="One voucher per student per month, with a due date and a late fine once it has passed."
        actions={
          <Link href="/admin/fees/packages" className="text-sm text-primary hover:underline">
            Packages and rules →
          </Link>
        }
      />
      <VoucherListScreen page={page} summary={summary} month={month} canManage={can(ctx, 'fees.manage')} />
    </>
  )
}

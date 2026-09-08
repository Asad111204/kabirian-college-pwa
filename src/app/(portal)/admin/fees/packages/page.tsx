import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getFeeRulesForAdmin, listFeePackages } from '@/server/services/fees.service'
import { PageHeader } from '@/components/layout/app-shell'
import { FeePackagesScreen } from '@/features/fees/fee-packages'

export const metadata: Metadata = { title: 'Fee packages' }
export const dynamic = 'force-dynamic'

/** Admin → Fees → Packages and rules. */
export default async function FeePackagesPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const [packages, rules] = await Promise.all([listFeePackages(ctx), getFeeRulesForAdmin(ctx)])

  return (
    <>
      <PageHeader
        title="Fee packages and rules"
        description="What the college charges, when a voucher falls due, and what a late one costs."
        actions={
          <Link href="/admin/fees" className="text-sm text-primary hover:underline">
            ← Vouchers
          </Link>
        }
      />
      <FeePackagesScreen packages={packages} rules={rules} canManage={can(ctx, 'fees.manage')} />
    </>
  )
}

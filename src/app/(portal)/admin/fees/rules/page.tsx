import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getFeeRulesForAdmin } from '@/server/services/fees.service'
import { PageHeader } from '@/components/layout/app-shell'
import { FeeRulesScreen } from '@/features/fees/fee-rules'

export const metadata: Metadata = { title: 'Fee rules' }
export const dynamic = 'force-dynamic'

/** Admin → Fees → Rules. */
export default async function FeeRulesPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const rules = await getFeeRulesForAdmin(ctx)

  return (
    <>
      <PageHeader
        title="Fee rules"
        description="What a late voucher costs, when the office has given one a due date."
        actions={
          <Link href="/admin/fees" className="text-sm text-primary hover:underline">
            ← Fee vouchers
          </Link>
        }
      />
      <FeeRulesScreen rules={rules} canManage={can(ctx, 'fees.manage')} />
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getFeeSessionSummary, listVouchers } from '@/server/services/fees.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { voucherListQuerySchema } from '@/validation/fees'
import { PageHeader } from '@/components/layout/app-shell'
import { VoucherListScreen } from '@/features/fees/voucher-list'

export const metadata: Metadata = { title: 'Fees' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Fees. One academic year at a time: what was charged, what has come
 * in, and what is still owed.
 */
export default async function AdminFeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = voucherListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : voucherListQuerySchema.parse({})

  const summary = await getFeeSessionSummary(ctx, query.academicSessionId)
  const [page, sessions] = await Promise.all([
    listVouchers(ctx, { ...query, academicSessionId: summary.academicSessionId }),
    listAcademicSessions(ctx),
  ])

  return (
    <>
      <PageHeader
        title="Fees"
        description="One voucher per student per year. Families pay it in instalments, whenever they can."
        actions={
          <Link href="/admin/fees/rules" className="text-sm text-primary hover:underline">
            Fee rules →
          </Link>
        }
      />
      <VoucherListScreen
        page={page}
        summary={summary}
        sessions={sessions.map((session) => ({ id: session.id, name: session.name }))}
        canManage={can(ctx, 'fees.manage')}
      />
    </>
  )
}

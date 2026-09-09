import type { Metadata } from 'next'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getFinanceSummary, listExpenses } from '@/server/services/finance.service'
import { monthStart } from '@/server/finance/finance-policy'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { expenseListQuerySchema, financeSummaryQuerySchema } from '@/validation/finance'
import { PageHeader } from '@/components/layout/app-shell'
import { FinanceScreen } from '@/features/finance/finance-screen'

export const metadata: Metadata = { title: 'Finance' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Finance. What came in against what went out, for a month and
 * across a year.
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const today = todayInCollegeTimezone()

  const summaryQuery = financeSummaryQuerySchema.safeParse(params)
  const listQuery = expenseListQuerySchema.safeParse(params)
  const month = monthStart((summaryQuery.success ? summaryQuery.data.month : undefined) ?? today)

  const [summary, expenses] = await Promise.all([
    getFinanceSummary(ctx, { month, months: summaryQuery.success ? summaryQuery.data.months : 12 }),
    listExpenses(ctx, { ...(listQuery.success ? listQuery.data : expenseListQuerySchema.parse({})), month }),
  ])

  return (
    <>
      <PageHeader title="Finance" description="Fees collected against money spent, and what is still owed." />
      <FinanceScreen summary={summary} expenses={expenses} today={today} canManage={can(ctx, 'finance.manage')} />
    </>
  )
}

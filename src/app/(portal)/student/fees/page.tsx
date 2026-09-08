import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyFees } from '@/server/services/fees.service'
import { myFeesQuerySchema } from '@/validation/fees'
import { PageHeader } from '@/components/layout/app-shell'
import { MyFeesScreen } from '@/features/fees/my-fees'

export const metadata: Metadata = { title: 'My fees' }
export const dynamic = 'force-dynamic'

/** Student → My Fees. Their own vouchers, read from their own record. */
export default async function StudentFeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const params = await searchParams
  const parsed = myFeesQuerySchema.safeParse(params)
  const page = await getMyFees(ctx, parsed.success ? parsed.data : myFeesQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="My fees" description="Your monthly vouchers, and what is still to pay." />
      <MyFeesScreen page={page} />
    </>
  )
}

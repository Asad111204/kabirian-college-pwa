import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyNoticeFeed } from '@/server/services/notices.service'
import { noticeFeedQuerySchema } from '@/validation/notices'
import { PageHeader } from '@/components/layout/app-shell'
import { NoticeFeed } from '@/features/notices/notice-feed'

export const metadata: Metadata = { title: 'Notices' }
export const dynamic = 'force-dynamic'

/**
 * Student → Notices. The first page is fetched here from the
 * signed-in reader's own scope; the client component pages and filters
 * through the same API, which decides what reaches them.
 */
export default async function StudentNoticesPage() {
  const ctx = await requirePortalAccess(['STUDENT'])
  const initial = await getMyNoticeFeed(ctx, noticeFeedQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="Notices" description="Announcements from the school that are for you." />
      <NoticeFeed initial={initial} />
    </>
  )
}

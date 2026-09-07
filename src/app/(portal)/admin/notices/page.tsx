import type { Metadata } from 'next'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getNoticeTargetOptions, listNotices } from '@/server/services/notices.service'
import { noticeListQuerySchema } from '@/validation/notices'
import { PageHeader } from '@/components/layout/app-shell'
import { NoticeList } from '@/features/notices/notice-list'

export const metadata: Metadata = { title: 'Notices' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Notices. The server authenticates, authorises and fetches one page;
 * the client component owns the filters and the editor. Plain data only
 * crosses the boundary (ADR-077).
 */
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = noticeListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : noticeListQuerySchema.parse({})

  const [result, options] = await Promise.all([listNotices(ctx, query), getNoticeTargetOptions(ctx)])

  return (
    <>
      <PageHeader
        title="Notices"
        description="Write a notice, choose who it is for, and publish it when it is ready."
      />
      <NoticeList
        notices={result.items}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{ status: query.status ?? '', category: query.category ?? '', search: query.search ?? '' }}
        options={options}
        canManage={can(ctx, 'notices.manage')}
      />
    </>
  )
}

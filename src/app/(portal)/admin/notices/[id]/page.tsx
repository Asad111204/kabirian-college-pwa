import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { can, requirePortalAccess } from '@/server/auth/context'
import { NotFoundError } from '@/server/api/errors'
import { getNotice, getNoticeTargetOptions } from '@/server/services/notices.service'
import { isDocumentStorageReady } from '@/server/services/documents.service'
import { PageHeader } from '@/components/layout/app-shell'
import { NoticeDetail } from '@/features/notices/notice-detail'

export const metadata: Metadata = { title: 'Notice' }
export const dynamic = 'force-dynamic'

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let notice
  try {
    notice = await getNotice(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [options, storageReady] = await Promise.all([getNoticeTargetOptions(ctx), isDocumentStorageReady()])

  return (
    <>
      <div className="mb-3">
        <Link
          href="/admin/notices"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All notices
        </Link>
      </div>
      <PageHeader title={notice.title} description={notice.audienceSummary} />
      <NoticeDetail
        initial={notice}
        options={options}
        canManage={can(ctx, 'notices.manage')}
        storageReady={storageReady}
      />
    </>
  )
}

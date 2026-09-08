import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getHomework, getHomeworkOptions } from '@/server/services/homework.service'
import { isDocumentStorageReady } from '@/server/services/documents.service'
import { NotFoundError } from '@/server/api/errors'
import { uuid } from '@/validation/common'
import { PageHeader } from '@/components/layout/app-shell'
import { HomeworkDetail } from '@/features/homework/homework-detail'

export const metadata: Metadata = { title: 'Homework' }
export const dynamic = 'force-dynamic'

export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const { id } = await params
  if (!uuid.safeParse(id).success) notFound()

  let homework
  try {
    homework = await getHomework(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const [options, storageReady] = await Promise.all([homework.canManage && can(ctx, 'homework.manage') ? getHomeworkOptions(ctx) : Promise.resolve({ targets: [] }), isDocumentStorageReady()])

  return (
    <>
      <PageHeader title="Homework" />
      <HomeworkDetail homework={homework} basePath="/student/homework" options={options} storageReady={storageReady} />
    </>
  )
}

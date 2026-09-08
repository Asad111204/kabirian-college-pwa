import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyHomeworkFeed } from '@/server/services/homework.service'
import { homeworkFeedQuerySchema } from '@/validation/homework'
import { PageHeader } from '@/components/layout/app-shell'
import { HomeworkFeed } from '@/features/homework/homework-feed'

export const metadata: Metadata = { title: 'Homework' }
export const dynamic = 'force-dynamic'

/**
 * Student → Homework. The first page is fetched here from the student's own
 * section; the client component pages through the same API.
 */
export default async function StudentHomeworkPage() {
  const ctx = await requirePortalAccess(['STUDENT'])
  const initial = await getMyHomeworkFeed(ctx, homeworkFeedQuerySchema.parse({}))
  return (
    <>
      <PageHeader title="Homework" description="What your teachers have set for your section, soonest due first." />
      <HomeworkFeed initial={initial} />
    </>
  )
}

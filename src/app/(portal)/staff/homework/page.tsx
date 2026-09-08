import type { Metadata } from 'next'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getHomeworkOptions, listHomework } from '@/server/services/homework.service'
import { homeworkListQuerySchema } from '@/validation/homework'
import { PageHeader } from '@/components/layout/app-shell'
import { HomeworkList } from '@/features/homework/homework-list'

export const metadata: Metadata = { title: 'Homework' }
export const dynamic = 'force-dynamic'

/**
 * Staff → Homework. The server scopes the rows and works out what this
 * person may set; the client component owns the filters and the editor.
 */
export default async function HomeworkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['STAFF'])
  const params = await searchParams
  const parsed = homeworkListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : homeworkListQuerySchema.parse({})
  const canCreate = can(ctx, 'homework.manage')
  const [result, options] = await Promise.all([listHomework(ctx, query), canCreate ? getHomeworkOptions(ctx) : Promise.resolve({ targets: [] })])

  return (
    <>
      <PageHeader title="Homework" description="Work you have set for your sections, and what your colleagues have set for the sections you share." />
      <HomeworkList
        items={result.items}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{ search: query.search ?? '', includePast: query.includePast }}
        options={options}
        basePath="/staff/homework"
        canCreate={canCreate}
      />
    </>
  )
}

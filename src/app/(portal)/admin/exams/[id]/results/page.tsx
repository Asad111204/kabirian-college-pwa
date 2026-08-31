import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { can, requirePortalAccess } from '@/server/auth/context'
import { NotFoundError } from '@/server/api/errors'
import {
  getGenerationPreview,
  getResultSummary,
  listResults,
} from '@/server/services/results.service'
import { getEnrollmentOptions } from '@/server/services/students.service'
import { resultListQuerySchema } from '@/validation/results'
import { PageHeader } from '@/components/layout/app-shell'
import { ResultsReview } from '@/features/results/results-review'

export const metadata: Metadata = { title: 'Results' }
export const dynamic = 'force-dynamic'

/**
 * Admin → one exam → Results.
 *
 * The server authenticates, authorises and fetches; the client component owns
 * the filters and the dialogs. Only plain data crosses the boundary (ADR-077).
 */
export default async function ExamResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params
  const search = await searchParams

  const parsed = resultListQuerySchema.safeParse(search)
  const query = parsed.success ? parsed.data : resultListQuerySchema.parse({})

  let preview
  try {
    preview = await getGenerationPreview(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [summary, results, options] = await Promise.all([
    getResultSummary(ctx, id),
    listResults(ctx, id, query),
    getEnrollmentOptions(ctx, preview.academicSessionId),
  ])

  // The filter dropdowns narrow each other from the session's own structure, so
  // nothing about the college's classes or programmes is written into the code.
  const groups = options.map((option) => ({
    classId: option.classId,
    className: option.className,
    programId: option.programId,
    programName: option.programName,
    sections: option.sections.map((section) => ({
      id: section.id,
      name: section.name,
      divisionName: option.divisionName,
    })),
  }))

  return (
    <>
      <div className="mb-3">
        <Link
          href={`/admin/exams/${id}`}
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to the exam
        </Link>
      </div>

      <PageHeader
        title={`Results — ${preview.examName}`}
        description={`${preview.examTypeName} · ${preview.sessionName}`}
      />

      <ResultsReview
        preview={preview}
        summary={summary}
        results={results.items}
        page={results.page}
        pageSize={results.pageSize}
        total={results.total}
        totalPages={results.totalPages}
        filters={{
          search: query.search ?? '',
          classId: query.classId ?? '',
          programId: query.programId ?? '',
          sectionId: query.sectionId ?? '',
          outcome: query.outcome ?? '',
          status: query.status ?? '',
        }}
        groups={groups}
        canGenerate={can(ctx, 'results.generate')}
        canPublish={can(ctx, 'results.publish')}
      />
    </>
  )
}

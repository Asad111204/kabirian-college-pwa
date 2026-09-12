import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError, NotFoundError } from '@/server/api/errors'
import { getMyPublishedResult } from '@/server/services/results.service'
import { env } from '@/server/config/env'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { PrintButton } from '@/features/results/print-button'
import { ResultCard } from '@/features/results/result-card'

export const metadata: Metadata = { title: 'Result Card' }
export const dynamic = 'force-dynamic'

/**
 * Student Portal → one published result, as the official card.
 *
 * The id in the address bar names a result; it does not name a student. The
 * service checks the result belongs to `ctx.studentId` and reports anything
 * else as not found, so pasting a classmate's result id gives the same page as
 * pasting a made-up one.
 *
 * Everything around the card carries `print-hide`, and the card carries
 * `print-area`, so the browser's own print dialogue produces the card alone on
 * one A4 page.
 */
export default async function StudentResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePortalAccess(['STUDENT'])
  const { id } = await params

  let result
  try {
    result = await getMyPublishedResult(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Result Card" />
          <Alert variant="warning" title="Your account is not linked to a student record">
            The college office needs to connect this login to your student record before your
            results appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <div className="print-hide mb-3">
        <Link
          href="/student/results"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All results
        </Link>
      </div>

      <div className="print-hide">
        <PageHeader
          title={result.examName}
          description={`${result.examTypeName} · ${result.sessionName}`}
          actions={<PrintButton />}
        />
      </div>

      <ResultCard result={result} collegeName={env.APP_COLLEGE_NAME} />
    </>
  )
}

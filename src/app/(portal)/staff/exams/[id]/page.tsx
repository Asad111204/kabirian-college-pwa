import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError, NotFoundError } from '@/server/api/errors'
import { getMarkSheet } from '@/server/services/marks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { MarkSheetView } from '@/features/marks/mark-sheet-view'

export const metadata: Metadata = { title: 'Marks' }
export const dynamic = 'force-dynamic'

/**
 * Staff Portal → one mark sheet.
 *
 * `getMarkSheet` re-checks the teaching assignment behind this exact paper and
 * section, so pasting somebody else's sheet id into the address bar is refused
 * here just as it is at the API.
 */
export default async function MarkSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['STAFF', 'ADMIN'])
  const { id } = await params

  let sheet
  try {
    sheet = await getMarkSheet(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Marks" />
          <Alert variant="danger" title="You cannot open this mark sheet">
            {error.message}
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <div className="mb-3">
        <Link
          href="/staff/exams"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All papers
        </Link>
      </div>

      <PageHeader
        title={`${sheet.subjectName} — ${sheet.className} ${sheet.sectionName}`}
        description={`${sheet.examName} · ${sheet.examTypeName}`}
      />

      <MarkSheetView sheet={sheet} />
    </>
  )
}

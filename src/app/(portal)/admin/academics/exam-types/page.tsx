import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listExamTypes } from '@/server/services/exams.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { ExamTypesManager } from '@/features/academics/exam-types-manager'

export const metadata: Metadata = { title: 'Exam Types' }
export const dynamic = 'force-dynamic'

/**
 * The kinds of examination the college holds.
 *
 * Nothing is seeded here — "First Term" and "Send-Up" are the college's words,
 * not this project's, so the list starts empty and the admin fills it in
 * (ADR-112). Reuses the same managed-list screen as Classes and Designations.
 */
export default async function ExamTypesPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const examTypes = await listExamTypes(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Exam Types"
        description="The kinds of examination you hold — a term test, a send-up, a final. An exam picks one of these."
      />

      <ExamTypesManager items={examTypes} />

      <Alert variant="info" className="mt-4">
        An exam type already used by an exam cannot be deleted — deactivate it instead, and every
        past exam keeps the name it was held under.
      </Alert>
    </>
  )
}

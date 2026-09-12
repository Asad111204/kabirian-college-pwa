import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError } from '@/server/api/errors'
import { getMyExamPapers } from '@/server/services/marks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { MyPapers } from '@/features/marks/my-papers'

export const metadata: Metadata = { title: 'Exams & Marks' }
export const dynamic = 'force-dynamic'

/**
 * Staff Portal → Exams & Marks.
 *
 * The list is built on the server from this teacher's own ACTIVE teaching
 * assignments. Nothing is chosen by the browser, so there is no paper, section
 * or subject id for anyone to substitute — and the server checks the same
 * assignment again when a sheet is actually opened.
 */
export default async function StaffExamsPage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let papers
  try {
    papers = await getMyExamPapers(ctx)
  } catch (error) {
    // A staff login that is not linked to a staff record has no assignments at
    // all, and no way to acquire any without the office.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Exams & Marks" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your papers
            appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader
        title="Exams & Marks"
        description="The papers you teach, for exams whose date sheet has been published."
      />
      <MyPapers papers={papers} />
    </>
  )
}

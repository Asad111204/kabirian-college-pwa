import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError } from '@/server/api/errors'
import { getMyPublishedResults } from '@/server/services/results.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { StudentResults } from '@/features/results/student-results'

export const metadata: Metadata = { title: 'My Results' }
export const dynamic = 'force-dynamic'

/**
 * Student Portal → My Results.
 *
 * Whose results these are comes from the session: `getMyPublishedResults` takes
 * no student id at all, so there is nothing in the URL or the request for
 * anyone to substitute.
 */
export default async function StudentResultsPage() {
  const ctx = await requirePortalAccess(['STUDENT'])

  let results
  try {
    results = await getMyPublishedResults(ctx)
  } catch (error) {
    // A student login that is not linked to a student record has no results and
    // no way to acquire any without the office.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My Results" />
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
      <PageHeader
        title="My Results"
        description="Your published examination results. Open one to see every subject."
      />
      <StudentResults results={results} />
    </>
  )
}

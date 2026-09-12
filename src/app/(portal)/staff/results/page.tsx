import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { ForbiddenError } from '@/server/api/errors'
import {
  getPublishedResultsForTeacher,
  getTeacherResultOptions,
} from '@/server/services/results.service'
import { teacherResultQuerySchema } from '@/validation/results'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { TeacherResults } from '@/features/results/teacher-results'

export const metadata: Metadata = { title: 'Results' }
export const dynamic = 'force-dynamic'

/**
 * Staff Portal → Results.
 *
 * The server authenticates, authorises and fetches; the client component owns
 * the filters and paging. Only plain data crosses the boundary (ADR-077).
 *
 * Scope comes from the teacher's own ACTIVE assignments, resolved from the
 * session — the filters below can only narrow it.
 */
export default async function StaffResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['STAFF'])
  const search = await searchParams

  const parsed = teacherResultQuerySchema.safeParse(search)
  const query = parsed.success ? parsed.data : teacherResultQuerySchema.parse({})

  let results
  let options
  try {
    ;[results, options] = await Promise.all([
      getPublishedResultsForTeacher(ctx, query),
      getTeacherResultOptions(ctx),
    ])
  } catch (error) {
    // A staff login that is not linked to a staff record has no assignments.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Results" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your
            students&rsquo; results appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <PageHeader
        title="Results"
        description="Published results for the subjects and sections you teach."
      />

      <TeacherResults
        rows={results.items}
        options={options}
        page={results.page}
        pageSize={results.pageSize}
        total={results.total}
        totalPages={results.totalPages}
        filters={{
          search: query.search ?? '',
          examId: query.examId ?? '',
          classId: query.classId ?? '',
          programId: query.programId ?? '',
          sectionId: query.sectionId ?? '',
          subjectId: query.subjectId ?? '',
        }}
      />
    </>
  )
}

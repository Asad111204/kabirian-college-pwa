import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import {
  getCurriculum,
  listAcademicSessions,
  listCurriculumOverview,
} from '@/server/services/academic-structure.service'
import { listSubjects } from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { CurriculumEditor } from '@/features/academics/curriculum-editor'

export const metadata: Metadata = { title: 'Curriculum' }
export const dynamic = 'force-dynamic'

/**
 * Academic Management -> Curriculum.
 *
 * Which subjects each Class x Program studies. Pre-Medical and ICS Physics can
 * have completely different subject lists — there is no single global list
 * (requirement 8).
 */
export default async function CurriculumPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; class?: string; program?: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  const sessions = await listAcademicSessions(ctx)
  const selectedSession =
    sessions.find((s) => s.id === params.session) ?? sessions.find((s) => s.isCurrent) ?? sessions[0]

  if (!selectedSession) {
    return (
      <>
        <PageHeader title="Curriculum" />
        <Alert variant="warning" title="No academic session yet">
          Create an academic session and its structure first.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  const [overview, subjectsPage] = await Promise.all([
    listCurriculumOverview(ctx, selectedSession.id),
    listSubjects(ctx, { pageSize: 100 }),
  ])

  const selectedPair =
    overview.find((row) => row.classId === params.class && row.programId === params.program) ??
    overview[0]

  const selected = selectedPair
    ? await getCurriculum(ctx, {
        academicSessionId: selectedSession.id,
        classId: selectedPair.classId,
        programId: selectedPair.programId,
      })
    : []

  return (
    <>
      <PageHeader
        title="Curriculum"
        description="The subjects each class and program studies in this session. Boys and Girls of the same program share one list, and so do all its sections."
      />

      {overview.length === 0 ? (
        <Alert variant="warning" title="No class and program combinations yet">
          Build the session structure first, then come back to choose subjects.{' '}
          <Link href="/admin/academics/structure">Go to Session Structure</Link>
        </Alert>
      ) : (
        <CurriculumEditor
          // Changing the session or the class+program gives the editor a new key,
          // so it restarts with that combination's own subject selection.
          key={`${selectedSession.id}:${selectedPair?.classId}:${selectedPair?.programId}`}
          sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
          selectedSessionId={selectedSession.id}
          pairs={overview}
          selectedPair={selectedPair ?? null}
          selectedSubjectIds={selected.map((row) => row.subjectId)}
          allSubjects={subjectsPage.items.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        />
      )}
    </>
  )
}

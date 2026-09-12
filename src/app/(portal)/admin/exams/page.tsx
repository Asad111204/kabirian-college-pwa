import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { listExamTypes, listExams } from '@/server/services/exams.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { examListQuerySchema } from '@/validation/exams'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { ExamList } from '@/features/exams/exam-list'

export const metadata: Metadata = { title: 'Exams' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Exams.
 *
 * The server authenticates, authorises and fetches; the client component owns
 * the filters and the forms. Only plain data crosses the boundary — no
 * functions — which is the rule ADR-077 exists to enforce.
 */
export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  const [sessions, examTypes] = await Promise.all([
    listAcademicSessions(ctx),
    listExamTypes(ctx),
  ])

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader title="Exams" />
        <Alert variant="warning" title="No academic session yet">
          An exam belongs to an academic session. Create one, and its structure, first.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  const currentSessionId = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? ''

  const parsed = examListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : examListQuerySchema.parse({})
  const academicSessionId = query.academicSessionId ?? currentSessionId

  const result = await listExams(ctx, { ...query, academicSessionId })

  return (
    <>
      <PageHeader
        title="Exams"
        description="Create an exam, set its papers, then publish the date sheet."
      />

      {examTypes.length === 0 ? (
        <Alert variant="warning" title="No exam types have been configured yet" className="mb-4">
          An exam has to be of some kind — a term test, a send-up, a final. Add the ones your
          college holds and they become selectable here immediately.{' '}
          <Link href="/admin/academics/exam-types">Go to Exam Types</Link>
        </Alert>
      ) : null}

      <ExamList
        exams={result.items.map((exam) => ({
          id: exam.id,
          name: exam.name,
          examTypeName: exam.examTypeName,
          sessionName: exam.sessionName,
          startDate: exam.startDate,
          endDate: exam.endDate,
          status: exam.status,
          paperCount: exam.paperCount,
          dateSheetPublished: exam.dateSheetPublished,
        }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{
          academicSessionId,
          examTypeId: query.examTypeId ?? '',
          status: query.status ?? '',
          search: query.search ?? '',
        }}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        examTypes={examTypes.map((t) => ({ id: t.id, name: t.name }))}
        canManage={can(ctx, 'exams.manage')}
      />
    </>
  )
}

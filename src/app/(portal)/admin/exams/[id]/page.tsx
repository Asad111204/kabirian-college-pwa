import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { can, requirePortalAccess } from '@/server/auth/context'
import { NotFoundError } from '@/server/api/errors'
import { buildDateSheet, findDateSheetProblems } from '@/server/exams/exam-policy'
import { getExam, getPaperOptions, listExamTypes } from '@/server/services/exams.service'
import { listExamMarkSheets } from '@/server/services/marks.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { PageHeader } from '@/components/layout/app-shell'
import { ExamDetail } from '@/features/exams/exam-detail'

export const metadata: Metadata = { title: 'Exam' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Exams → one exam.
 *
 * Everything the screen needs is fetched here: the exam with its papers in one
 * query, the options a new paper may use, and the schedule already grouped for
 * reading. The client component receives plain data and handles the dialogs.
 */
export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { id } = await params

  let exam
  try {
    exam = await getExam(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [options, sessions, examTypes, markSheets] = await Promise.all([
    getPaperOptions(ctx, exam.academicSessionId),
    listAcademicSessions(ctx),
    listExamTypes(ctx, { includeInactive: true }),
    listExamMarkSheets(ctx, exam.id),
  ])

  return (
    <>
      <div className="mb-3">
        <Link
          href="/admin/exams"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All exams
        </Link>
      </div>

      <PageHeader title={exam.name} description={`${exam.examTypeName} · ${exam.sessionName}`} />

      <ExamDetail
        exam={exam}
        dateSheet={buildDateSheet(exam.papers)}
        problems={findDateSheetProblems(exam.papers)}
        options={options}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        examTypes={examTypes.map((t) => ({ id: t.id, name: t.name }))}
        markSheets={markSheets}
        canManage={can(ctx, 'exams.manage')}
      />
    </>
  )
}

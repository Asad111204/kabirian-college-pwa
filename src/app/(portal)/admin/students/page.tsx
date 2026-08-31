import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import { getEnrollmentOptions, listStudents } from '@/server/services/students.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { studentListQuerySchema } from '@/validation/students'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { StudentsTable } from '@/features/students/students-table'

export const metadata: Metadata = { title: 'Students' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Students.
 *
 * `requirePortalAccess(['ADMIN'])` runs on the server before anything renders,
 * and every service call checks the `students.view` permission again.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  // A stale or hand-edited query falls back to the defaults instead of erroring.
  const parsed = studentListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : studentListQuerySchema.parse({})

  const [result, sessions] = await Promise.all([
    listStudents(ctx, query),
    listAcademicSessions(ctx),
  ])

  // The filter dropdowns use the same structure the enrollment form does.
  const groups = result.sessionId ? await getEnrollmentOptions(ctx, result.sessionId) : []

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader title="Students" />
        <Alert variant="warning" title="No academic session yet">
          Create an academic session and its structure before admitting students.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Admit students, manage their records and move them through the academic structure."
      />

      <StudentsTable
        students={result.items.map((student) => ({
          id: student.id,
          studentCode: student.studentCode,
          admissionNumber: student.admissionNumber,
          fullName: student.fullName,
          fatherName: student.fatherName,
          status: student.status,
          placement: student.placement
            ? {
                className: student.placement.className,
                divisionName: student.placement.divisionName,
                programName: student.placement.programName,
                sectionName: student.placement.sectionName,
                sessionName: student.placement.sessionName,
                rollNumber: student.placement.rollNumber,
              }
            : null,
          account: student.account
            ? { username: student.account.username, isActive: student.account.isActive }
            : null,
        }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        counts={result.counts}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        groups={groups}
        filters={{
          search: query.search ?? '',
          sessionId: result.sessionId ?? '',
          classId: query.classId ?? '',
          divisionId: query.divisionId ?? '',
          programId: query.programId ?? '',
          sectionId: query.sectionId ?? '',
          status: query.status,
          sort: query.sort,
          direction: query.direction,
        }}
      />

      <Alert variant="info" className="mt-4">
        Students are never deleted. A student who leaves keeps every enrollment record — change
        their status instead, and their history stays intact.
      </Alert>
    </>
  )
}

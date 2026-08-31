import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { listAttendanceSheets } from '@/server/services/attendance.service'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { getEnrollmentOptions } from '@/server/services/students.service'
import { listSubjects } from '@/server/services/academic-blocks.service'
import { listStaff } from '@/server/services/staff.service'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { attendanceSheetListQuerySchema } from '@/validation/attendance'
import { staffListQuerySchema } from '@/validation/staff'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { AttendanceList } from '@/features/attendance/attendance-list'

export const metadata: Metadata = { title: 'Attendance' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Attendance.
 *
 * The server authenticates, authorises and fetches; the client component handles
 * filtering and forms. Only plain data crosses the boundary — no functions —
 * which is the rule ADR-077 exists to enforce.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams

  const sessions = await listAcademicSessions(ctx)

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader title="Attendance" />
        <Alert variant="warning" title="No academic session yet">
          Create an academic session and its structure before taking attendance.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  const currentSessionId = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? ''

  // These three narrow the section dropdown in the browser; the API filters by
  // the resulting sectionId, so they are stripped before the query is parsed.
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? ''
  const classId = first(params.classId)
  const divisionId = first(params.divisionId)
  const programId = first(params.programId)

  const parsed = attendanceSheetListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : attendanceSheetListQuerySchema.parse({})
  const academicSessionId = query.academicSessionId ?? currentSessionId

  const [result, groups, subjectPage, staffPage] = await Promise.all([
    listAttendanceSheets(ctx, { ...query, academicSessionId }),
    getEnrollmentOptions(ctx, academicSessionId),
    listSubjects(ctx, { pageSize: 100 }),
    listStaff(ctx, staffListQuerySchema.parse({ pageSize: 100 })),
  ])

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Registers taken across the college. Open one to mark it, submit it, or correct it."
      />

      <AttendanceList
        sheets={result.items.map((sheet) => ({
          id: sheet.id,
          date: sheet.date,
          period: sheet.period,
          status: sheet.status,
          sectionId: sheet.sectionId,
          sectionName: sheet.sectionName,
          className: sheet.className,
          divisionName: sheet.divisionName,
          programName: sheet.programName,
          subjectId: sheet.subjectId,
          subjectName: sheet.subjectName,
          markedByName: sheet.markedByName,
          studentCount: sheet.studentCount,
          counts: sheet.counts,
        }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{
          academicSessionId,
          classId,
          divisionId,
          programId,
          sectionId: query.sectionId ?? '',
          subjectId: query.subjectId ?? '',
          staffId: query.staffId ?? '',
          status: query.status ?? '',
          date: query.date ?? '',
          dateFrom: query.dateFrom ?? '',
          dateTo: query.dateTo ?? '',
        }}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        groupsBySession={{ [academicSessionId]: groups }}
        subjects={subjectPage.items.map((s) => ({ id: s.id, name: s.name }))}
        staff={staffPage.items.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          staffCode: s.staffCode,
        }))}
        today={todayInCollegeTimezone()}
        canCreate={can(ctx, 'attendance.create')}
      />

      <Alert variant="info" className="mt-4">
        Only submitted registers count towards attendance percentages. A draft is still being
        marked, and a cancelled class did not happen — neither affects any student&rsquo;s figures.
      </Alert>
    </>
  )
}

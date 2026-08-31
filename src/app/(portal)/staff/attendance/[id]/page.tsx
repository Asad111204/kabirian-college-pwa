import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getAttendanceSheet } from '@/server/services/attendance.service'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { TeacherRegisterView } from '@/features/attendance/teacher-register-view'

export const metadata: Metadata = { title: 'Register' }
export const dynamic = 'force-dynamic'

/**
 * One register, as the teacher sees it.
 *
 * `getAttendanceSheet` refuses any section this teacher does not teach in or run,
 * so typing another register's id into the address bar returns 403 rather than
 * somebody else's class.
 *
 * The roster carries no father's name, no CNIC and no documents — only what is
 * needed to call a register.
 */
export default async function StaffRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePortalAccess(['STAFF'])
  const { id } = await params

  let sheet
  try {
    sheet = await getAttendanceSheet(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  return (
    <>
      <PageHeader
        title="Register"
        description={`${sheet.className} · Section ${sheet.sectionName}`}
      />

      <TeacherRegisterView
        register={{
          id: sheet.id,
          date: sheet.date,
          period: sheet.period,
          status: sheet.status,
          sectionName: sheet.sectionName,
          className: sheet.className,
          divisionName: sheet.divisionName,
          programName: sheet.programName,
          subjectName: sheet.subjectName,
          markedByName: sheet.markedByName,
          submittedAt: sheet.submittedAt,
          cancelledReason: sheet.cancelledReason,
          studentCount: sheet.studentCount,
          entries: sheet.entries.map((entry) => ({
            id: entry.id,
            studentId: entry.studentId,
            studentCode: entry.studentCode,
            fullName: entry.fullName,
            rollNumber: entry.rollNumber,
            status: entry.status,
            remarks: entry.remarks,
          })),
        }}
        canUpdate={can(ctx, 'attendance.update')}
      />
    </>
  )
}

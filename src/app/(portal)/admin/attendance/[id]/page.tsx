import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getAttendanceSheet } from '@/server/services/attendance.service'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { AttendanceSheetView } from '@/features/attendance/attendance-sheet-view'

export const metadata: Metadata = { title: 'Attendance register' }
export const dynamic = 'force-dynamic'

/**
 * One attendance register.
 *
 * The service checks the ADMIN role and the `attendance.view` permission before
 * returning anything, so this page cannot render for someone who should not see
 * it even if they type the id directly.
 */
export default async function AttendanceSheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
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
        title="Attendance register"
        description={`${sheet.className} · Section ${sheet.sectionName}`}
      />

      <AttendanceSheetView
        sheet={{
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
          counts: sheet.counts,
          percentage: sheet.percentage,
          entries: sheet.entries.map((entry) => ({
            id: entry.id,
            studentId: entry.studentId,
            studentCode: entry.studentCode,
            fullName: entry.fullName,
            fatherName: entry.fatherName,
            rollNumber: entry.rollNumber,
            status: entry.status,
            remarks: entry.remarks,
          })),
        }}
        canUpdate={can(ctx, 'attendance.update')}
        canUpdateSubmitted={can(ctx, 'attendance.update_submitted')}
      />
    </>
  )
}

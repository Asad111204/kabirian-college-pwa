import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getStaffAttendanceDay } from '@/server/services/staff-attendance.service'
import { staffAttendanceDayQuerySchema } from '@/validation/staff-attendance'
import { PageHeader } from '@/components/layout/app-shell'
import { StaffRegister } from '@/features/staff-attendance/staff-register'

export const metadata: Metadata = { title: 'Staff attendance' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Staff Attendance. The office's own register for one day: everyone
 * employed that day, marked Present, Absent, Short leave or Leave.
 */
export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = staffAttendanceDayQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : staffAttendanceDayQuerySchema.parse({})
  const day = await getStaffAttendanceDay(ctx, query)

  return (
    <>
      <PageHeader
        title="Staff attendance"
        description="The school's own register. Present, Absent, Short leave or Leave — for the day shown."
        actions={
          <Link href="/admin/staff-attendance/month" className="text-sm text-primary hover:underline">
            This month →
          </Link>
        }
      />
      <StaffRegister day={day} canMark={can(ctx, 'staff_attendance.mark')} />
    </>
  )
}

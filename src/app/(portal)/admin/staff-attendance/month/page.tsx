import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import { getStaffAttendanceMonth } from '@/server/services/staff-attendance.service'
import { staffAttendanceMonthQuerySchema } from '@/validation/staff-attendance'
import { PageHeader } from '@/components/layout/app-shell'
import { StaffAttendanceMonthView } from '@/features/staff-attendance/staff-attendance-month'

export const metadata: Metadata = { title: 'Staff attendance — month' }
export const dynamic = 'force-dynamic'

/** Admin → Staff Attendance → the month: one row per staff member, counted. */
export default async function StaffAttendanceMonthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const params = await searchParams
  const parsed = staffAttendanceMonthQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : staffAttendanceMonthQuerySchema.parse({})
  const month = await getStaffAttendanceMonth(ctx, query)

  return (
    <>
      <PageHeader
        title="Staff attendance"
        description="How the month has been marked so far."
        actions={
          <Link href="/admin/staff-attendance" className="text-sm text-primary hover:underline">
            ← Today&apos;s register
          </Link>
        }
      />
      <StaffAttendanceMonthView month={month} />
    </>
  )
}

import { CalendarCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { attendanceBand } from '@/features/attendance/bands'
import { formatDate } from '@/lib/format'
import { STAFF_ATTENDANCE_STATUS_LABEL, type StaffAttendanceStatusValue } from '@/server/staff-attendance/staff-attendance-policy'
import type { MyStaffAttendance } from '@/server/services/staff-attendance.service'

const VARIANT: Record<StaffAttendanceStatusValue, 'success' | 'danger' | 'warning' | 'info'> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  SHORT_LEAVE: 'warning',
  LEAVE: 'info',
}

/**
 * A staff member's own attendance for this month, on their profile.
 *
 * Read-only and their own: the office keeps this register, and a correction
 * is asked for rather than made here.
 */
export function MyAttendanceCard({ attendance }: { attendance: MyStaffAttendance }) {
  const band = attendanceBand(attendance.percentage)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>My attendance</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">{attendance.monthLabel}</p>
        </div>
        {attendance.percentage !== null ? (
          <span className={band?.text}>
            <span className="text-lg font-semibold tabular-nums">{attendance.percentage}%</span>
            {band ? <span className="block text-xs">{band.label}</span> : null}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {attendance.days.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nothing marked yet" description="The office has not taken the staff register this month." />
        ) : (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([
                ['Present', attendance.counts.present],
                ['Short leave', attendance.counts.shortLeave],
                ['Leave', attendance.counts.leave],
                ['Absent', attendance.counts.absent],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-foreground-muted">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-border">
              {attendance.days.map((day) => (
                <li key={day.date} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-foreground">{formatDate(day.date)}</span>
                  <span className="flex items-center gap-2">
                    {day.remarks ? <span className="text-xs text-foreground-muted">{day.remarks}</span> : null}
                    <Badge variant={VARIANT[day.status]}>{STAFF_ATTENDANCE_STATUS_LABEL[day.status]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

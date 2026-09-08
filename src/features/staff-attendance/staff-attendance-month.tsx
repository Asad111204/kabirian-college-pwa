'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { attendanceBand } from '@/features/attendance/bands'
import type { StaffAttendanceMonth } from '@/server/services/staff-attendance.service'

/**
 * Admin → Staff Attendance → the month.
 *
 * One row per staff member: the four counts and how much of the marked month
 * was worked. The percentage uses the same colour bands as the students'
 * (Phase 18), and always with the figure and a word beside it.
 */
export function StaffAttendanceMonthView({ month }: { month: StaffAttendanceMonth }) {
  const router = useRouter()

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 pb-2 text-sm text-foreground-muted">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Month
          </div>
          <Input
            type="month"
            value={month.month.slice(0, 7)}
            onChange={(e) => router.push(e.target.value ? `/admin/staff-attendance/month?month=${e.target.value}-01` : '/admin/staff-attendance/month')}
            aria-label="Month"
            className="max-w-[12rem]"
          />
          <p className="pb-2 text-sm text-foreground-muted">
            {month.monthLabel} · {month.daysMarked} day{month.daysMarked === 1 ? '' : 's'} marked
          </p>
        </div>
      </Card>

      <Alert variant="info" className="mb-4">
        Approved <span className="font-medium">leave</span> is left out of the percentage rather than counted against anyone. Short leave counts as a
        day at work, and is listed separately so a pattern stays visible.
      </Alert>

      {month.rows.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No staff to show" description="Nobody matches these filters." />
        </Card>
      ) : (
        <Card>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Staff member</TH>
                  <TH className="hidden md:table-cell">Department</TH>
                  <TH className="text-right">Present</TH>
                  <TH className="text-right">Short leave</TH>
                  <TH className="text-right">Leave</TH>
                  <TH className="text-right">Absent</TH>
                  <TH className="text-right">Worked</TH>
                </TR>
              </THead>
              <TBody>
                {month.rows.map((row) => {
                  const band = attendanceBand(row.percentage)
                  return (
                    <TR key={row.staffId}>
                      <TD>
                        <span className="font-medium text-foreground">{row.fullName}</span>
                        <span className="block text-xs text-foreground-muted">
                          {row.staffCode} · {row.designation}
                        </span>
                      </TD>
                      <TD className="hidden text-sm text-foreground-muted md:table-cell">{row.department ?? '—'}</TD>
                      <TD className="text-right tabular-nums">{row.counts.present}</TD>
                      <TD className="text-right tabular-nums">{row.counts.shortLeave}</TD>
                      <TD className="text-right tabular-nums">{row.counts.leave}</TD>
                      <TD className="text-right tabular-nums">{row.counts.absent}</TD>
                      <TD className="text-right">
                        {row.percentage === null ? (
                          <span className="text-foreground-subtle">—</span>
                        ) : (
                          <span className={band?.text}>
                            <span className="font-semibold tabular-nums">{row.percentage}%</span>
                            {band ? <span className="block text-xs font-normal">{band.label}</span> : null}
                          </span>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrapper>
        </Card>
      )}
    </>
  )
}

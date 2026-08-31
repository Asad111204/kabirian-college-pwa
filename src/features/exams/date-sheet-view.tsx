import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { DateSheetGroup } from '@/server/exams/exam-policy'
import { formatExamDate, formatMarks, formatTimeRange } from './shared'

/**
 * The date sheet, as a student reads it: one schedule per class and programme.
 *
 * A paper every programme sits appears in each of their schedules, because
 * someone looking up "1st Year, Pre-Medical" wants their whole timetable, not
 * the part that happens to be programme-specific.
 *
 * No `'use client'`: this is presentational, so the Admin screen renders it now
 * and the staff and student views can render it unchanged later.
 */
export function DateSheetView({ groups }: { groups: DateSheetGroup[] }) {
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled yet"
          description="Add papers with a date and time, and the schedule builds itself here."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={`${group.classId}:${group.programId ?? 'ALL'}`}>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              {group.className} — {group.programName}
            </h3>
            <p className="text-xs text-foreground-muted">
              {group.entries.length} paper{group.entries.length === 1 ? '' : 's'}
            </p>
          </div>

          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH className="whitespace-nowrap">Date</TH>
                  <TH className="whitespace-nowrap">Time</TH>
                  <TH>Subject</TH>
                  <TH className="hidden sm:table-cell">Marks</TH>
                  <TH className="hidden md:table-cell">Room</TH>
                </TR>
              </THead>
              <TBody>
                {group.entries.map((entry) => (
                  <TR key={entry.paperId}>
                    <TD className="whitespace-nowrap font-medium">
                      {formatExamDate(entry.examDate)}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">
                      {formatTimeRange(entry.startTime, entry.endTime)}
                    </TD>
                    <TD>
                      {entry.subjectName}
                      <span className="block text-xs text-foreground-muted sm:hidden">
                        {formatMarks(entry.maxMarks)} marks
                        {entry.room ? ` · ${entry.room}` : ''}
                      </span>
                    </TD>
                    <TD className="hidden sm:table-cell tabular-nums">
                      {formatMarks(entry.maxMarks)}
                    </TD>
                    <TD className="hidden md:table-cell">
                      {entry.room ?? <span className="text-foreground-subtle">—</span>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </Card>
      ))}
    </div>
  )
}

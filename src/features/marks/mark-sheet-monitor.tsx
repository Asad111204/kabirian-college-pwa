import * as React from 'react'
import { ClipboardList } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import type { MarkSheetStatusRow } from '@/server/services/marks.service'
import { MarkSheetStatusBadge } from './shared'

/**
 * Admin → one exam → who has marked what.
 *
 * One row per paper and section the exam covers, whether a teacher has started
 * or not — the unstarted ones are the interesting rows, because they are the
 * work still outstanding.
 *
 * Status only. No marks appear here: reading a student's mark is the marks
 * screen's job, and this is a progress board.
 */
export function MarkSheetMonitor({ rows }: { rows: MarkSheetStatusRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Nothing to mark yet"
          description="Add papers to this exam, and the sections that sit each one appear here."
        />
      </Card>
    )
  }

  const started = rows.filter((row) => row.sheetId !== null)
  const submitted = rows.filter((row) => row.status === 'SUBMITTED' || row.status === 'PUBLISHED')

  return (
    <>
      <Alert variant="info" className="mb-3">
        {submitted.length} of {rows.length} mark sheet{rows.length === 1 ? '' : 's'} submitted
        {started.length > submitted.length
          ? `, ${started.length - submitted.length} still in draft`
          : ''}
        .
      </Alert>

      <Card>
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>Section</TH>
                <TH className="hidden lg:table-cell">Teacher</TH>
                <TH className="hidden sm:table-cell text-right">Students</TH>
                <TH className="hidden md:table-cell text-right">Entered</TH>
                <TH className="hidden md:table-cell text-right">Absent</TH>
                <TH className="hidden md:table-cell text-right">Not entered</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={`${row.examPaperId}:${row.sectionId}`}>
                  <TD className="font-medium">
                    {row.subjectName}
                    <span className="block text-xs font-normal text-foreground-muted">
                      {row.className}
                      {row.programName ? ` · ${row.programName}` : ' · all programmes'}
                    </span>
                  </TD>
                  <TD>
                    {row.divisionName} · {row.sectionName}
                  </TD>
                  <TD className="hidden lg:table-cell">
                    {row.teacherName ?? (
                      <span className="text-warning-700">No teacher assigned</span>
                    )}
                  </TD>
                  <TD className="hidden sm:table-cell text-right tabular-nums">
                    {row.counts.total || '—'}
                  </TD>
                  <TD className="hidden md:table-cell text-right tabular-nums">
                    {row.sheetId ? row.counts.entered : '—'}
                  </TD>
                  <TD className="hidden md:table-cell text-right tabular-nums">
                    {row.sheetId ? row.counts.absent : '—'}
                  </TD>
                  <TD className="hidden md:table-cell text-right tabular-nums">
                    {row.sheetId ? row.counts.pending : '—'}
                  </TD>
                  <TD>
                    <MarkSheetStatusBadge status={row.status} />
                    {row.submittedAt ? (
                      <span className="block text-xs text-foreground-muted">
                        {formatDateTime(row.submittedAt)}
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      </Card>
    </>
  )
}

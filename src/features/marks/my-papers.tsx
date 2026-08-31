'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatExamDate, formatTimeRange, formatMarks } from '@/features/exams/shared'
import type { MyPaperOption } from '@/server/services/marks.service'
import { MarkSheetStatusBadge, progressLabel } from './shared'

/**
 * Staff → Exams & Marks.
 *
 * Every row is a paper this teacher is assigned to teach, in a section they
 * teach it in. Nothing else appears: the list is built from their own ACTIVE
 * teaching assignments, and the server checks the same assignment again when a
 * sheet is opened, so the screen is a convenience rather than the boundary.
 */
export function MyPapers({ papers }: { papers: MyPaperOption[] }) {
  const router = useRouter()
  const [opening, setOpening] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function open(paper: MyPaperOption) {
    const key = `${paper.examPaperId}:${paper.sectionId}`
    setOpening(key)
    setError(null)
    try {
      const sheet = await api.post<{ id: string }>('/api/v1/marks/sheets', {
        examPaperId: paper.examPaperId,
        sectionId: paper.sectionId,
      })
      router.push(`/staff/exams/${sheet.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The mark sheet could not be opened.')
      toast.error('The mark sheet could not be opened.')
      setOpening(null)
    }
  }

  if (papers.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BookOpen}
          title="No papers to mark"
          description="Papers appear here once the office publishes a date sheet for an exam covering a subject you teach. If you think one is missing, ask the office to check your teaching assignments."
        />
      </Card>
    )
  }

  // Grouped by exam, because a teacher thinks in terms of "First Term", not a
  // flat list of papers.
  const byExam = new Map<string, MyPaperOption[]>()
  for (const paper of papers) {
    const list = byExam.get(paper.examId) ?? []
    list.push(paper)
    byExam.set(paper.examId, list)
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {[...byExam.values()].map((group) => {
        const first = group[0]!
        return (
          <Card key={first.examId}>
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">{first.examName}</h2>
              <p className="text-xs text-foreground-muted">
                {first.examTypeName} · {first.sessionName}
              </p>
            </div>

            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH>Class &amp; section</TH>
                    <TH className="hidden sm:table-cell whitespace-nowrap">Date</TH>
                    <TH className="hidden lg:table-cell whitespace-nowrap">Time</TH>
                    <TH className="hidden md:table-cell whitespace-nowrap">Max</TH>
                    <TH>Marks</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {group.map((paper) => {
                    const key = `${paper.examPaperId}:${paper.sectionId}`
                    const sheet = paper.sheet
                    return (
                      <TR key={key}>
                        <TD className="font-medium">{paper.subjectName}</TD>
                        <TD>
                          {paper.className} · {paper.divisionName} · {paper.sectionName}
                          <span className="block text-xs text-foreground-muted sm:hidden">
                            {formatExamDate(paper.examDate)}
                          </span>
                        </TD>
                        <TD className="hidden sm:table-cell whitespace-nowrap">
                          {formatExamDate(paper.examDate)}
                        </TD>
                        <TD className="hidden lg:table-cell whitespace-nowrap tabular-nums">
                          {formatTimeRange(paper.startTime, paper.endTime)}
                        </TD>
                        <TD className="hidden md:table-cell tabular-nums">
                          {formatMarks(paper.maxMarks)}
                        </TD>
                        <TD>
                          <MarkSheetStatusBadge status={sheet?.status ?? null} />
                          {sheet ? (
                            <span className="block text-xs text-foreground-muted">
                              {progressLabel(sheet.counts)}
                            </span>
                          ) : (
                            <span className="block text-xs text-foreground-muted">
                              {paper.studentCount} student{paper.studentCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <Button
                            size="sm"
                            variant={sheet?.status === 'DRAFT' || !sheet ? 'primary' : 'secondary'}
                            loading={opening === key}
                            onClick={() => open(paper)}
                          >
                            <PenLine className="h-4 w-4" aria-hidden />
                            {sheet
                              ? sheet.status === 'DRAFT'
                                ? 'Continue'
                                : 'View'
                              : 'Enter marks'}
                          </Button>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          </Card>
        )
      })}
    </div>
  )
}

'use client'

import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import type { ResultDetail } from '@/server/services/results.service'
import {
  marksLabel,
  OutcomeBadge,
  percentageLabel,
  positionLabel,
  SubjectOutcomeBadge,
} from './shared'

/**
 * One student's result, subject by subject.
 *
 * Everything shown is the **stored snapshot** taken when the result was
 * generated — subject names, maximums, grades and the scale that produced them.
 * Renaming a subject or editing the grading scale afterwards cannot change what
 * this dialog shows (ADR-108).
 */
export function ResultDetailDialog({
  resultId,
  onClose,
}: {
  resultId: string | null
  onClose: () => void
}) {
  // Both pieces of state carry the id they belong to, so "still loading" is
  // *derived* from a mismatch rather than set by clearing them first — clearing
  // would mean a setState inside the effect, and a frame showing the previous
  // student's marks under the new student's name.
  const [loaded, setLoaded] = React.useState<{ id: string; detail: ResultDetail } | null>(null)
  const [failed, setFailed] = React.useState<{ id: string; message: string } | null>(null)

  // The breakdown is fetched on demand rather than sent with every row: a
  // hundred subject arrays would make the list payload many times larger for
  // something the admin opens one at a time.
  React.useEffect(() => {
    if (!resultId) return
    let cancelled = false

    api
      .get<ResultDetail>(`/api/v1/results/${resultId}`)
      .then((fresh) => {
        // A response that arrives after the dialog moved on is discarded.
        if (!cancelled) setLoaded({ id: resultId, detail: fresh })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFailed({
          id: resultId,
          message: err instanceof ApiError ? err.message : 'That result could not be loaded.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [resultId])

  const detail = loaded && loaded.id === resultId ? loaded.detail : null
  const error = failed && failed.id === resultId ? failed.message : null
  const incomplete = detail?.outcome === 'INCOMPLETE'

  return (
    <Dialog open={resultId !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        title={detail ? detail.studentName : 'Result'}
        description={
          detail
            ? `${detail.studentCode} · ${detail.className} ${detail.divisionName} · ${detail.programName} · Section ${detail.sectionName}`
            : undefined
        }
        className="sm:max-w-2xl"
      >
        {error ? <Alert variant="danger">{error}</Alert> : null}

        {!detail && !error ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-foreground-muted">Total</dt>
                <dd className="font-medium tabular-nums">
                  {marksLabel(detail.totalObtainedMarks)} / {marksLabel(detail.totalMaxMarks)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Percentage</dt>
                <dd className="font-medium tabular-nums">
                  {percentageLabel(detail.percentage)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Grade</dt>
                <dd className="font-medium">{detail.grade ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Position</dt>
                <dd className="font-medium">{positionLabel(detail.position)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={detail.outcome} />
              <span className="text-xs text-foreground-muted">
                {detail.examName} · {detail.examTypeName} · {detail.sessionName}
              </span>
            </div>

            {incomplete ? (
              <Alert variant="warning" title="Incomplete">
                Not every paper has a mark, so this student has no percentage, no grade and no
                position. The figures below show only what has been marked.
              </Alert>
            ) : null}

            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH className="text-right">Max</TH>
                    <TH className="text-right">Obtained</TH>
                    <TH className="hidden sm:table-cell text-right">%</TH>
                    <TH className="hidden sm:table-cell">Grade</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.subjects.map((subject) => (
                    <TR key={subject.examPaperId}>
                      <TD className="font-medium">{subject.subjectName}</TD>
                      <TD className="text-right tabular-nums">{marksLabel(subject.maxMarks)}</TD>
                      <TD className="text-right tabular-nums">
                        {/* An absent student scores 0; an unmarked paper shows a dash. */}
                        {subject.status === 'PENDING' ? '—' : marksLabel(subject.obtainedMarks)}
                      </TD>
                      <TD className="hidden sm:table-cell text-right tabular-nums">
                        {percentageLabel(subject.percentage)}
                      </TD>
                      <TD className="hidden sm:table-cell">{subject.grade ?? '—'}</TD>
                      <TD>
                        <SubjectOutcomeBadge outcome={subject.outcome} status={subject.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <p className="text-xs text-foreground-muted">
              Version {detail.version} · graded on the {detail.gradeScaleName ?? 'configured'} scale
              {detail.correctionReason ? ` · corrected: ${detail.correctionReason}` : ''}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

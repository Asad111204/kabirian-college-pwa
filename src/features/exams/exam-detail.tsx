'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleSlash, FileText, Pencil, Plus, RotateCcw, Send, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import type { DateSheetGroup, DateSheetProblem } from '@/server/exams/exam-policy'
import type { ExamDetail as ExamDetailData, PaperOptionClass } from '@/server/services/exams.service'
import { MarkSheetMonitor } from '@/features/marks/mark-sheet-monitor'
import type { MarkSheetStatusRow } from '@/server/services/marks.service'
import { DateSheetView } from './date-sheet-view'
import { ExamFormDialog, type ExamTypeOption, type SessionOption } from './exam-form-dialog'
import { PaperFormDialog, type PaperFormValues } from './paper-form-dialog'
import { DateRange, ExamStatusBadge, formatExamDate, formatMarks, formatTimeRange, programLabel } from './shared'

type Confirm =
  | { kind: 'publish' }
  | { kind: 'withdraw' }
  | { kind: 'cancel' }
  | { kind: 'reopen' }
  | { kind: 'delete' }
  | { kind: 'deletePaper'; paperId: string; label: string }

/**
 * Admin → Exams → one exam.
 *
 * Two views of the same papers: a working table while the schedule is being
 * built, and the date sheet as everyone else will read it. Publishing moves the
 * exam out of draft, and from that moment the papers are frozen — the only way
 * back is an explicit withdrawal, which is audited, because teachers and
 * students may already have written the dates down.
 */
export function ExamDetail({
  exam,
  dateSheet,
  problems,
  options,
  sessions,
  examTypes,
  markSheets,
  canManage,
}: {
  exam: ExamDetailData
  dateSheet: DateSheetGroup[]
  problems: DateSheetProblem[]
  options: PaperOptionClass[]
  sessions: SessionOption[]
  examTypes: ExamTypeOption[]
  markSheets: MarkSheetStatusRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<'papers' | 'schedule' | 'marks'>('papers')
  const [editOpen, setEditOpen] = React.useState(false)
  const [paperOpen, setPaperOpen] = React.useState(false)
  const [editingPaper, setEditingPaper] = React.useState<PaperFormValues | undefined>(undefined)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const editable = exam.status === 'DRAFT'
  const published = exam.dateSheetPublished

  function openNewPaper() {
    setEditingPaper(undefined)
    setPaperOpen(true)
  }

  function openEditPaper(paperId: string) {
    const paper = exam.papers.find((p) => p.id === paperId)
    if (!paper) return
    setEditingPaper({
      id: paper.id,
      classId: paper.classId,
      programId: paper.programId ?? '',
      subjectId: paper.subjectId,
      examDate: paper.examDate ?? '',
      startTime: paper.startTime ?? '',
      endTime: paper.endTime ?? '',
      room: paper.room ?? '',
      maxMarks: paper.maxMarks,
      passingPercentage: paper.passingPercentage,
    })
    setPaperOpen(true)
  }

  async function runConfirmed() {
    if (!confirm) return
    setBusy(true)
    setActionError(null)
    try {
      switch (confirm.kind) {
        case 'publish':
          await api.patch(`/api/v1/exams/${exam.id}/date-sheet`, { publish: true })
          toast.success('Date sheet published.')
          break
        case 'withdraw':
          await api.patch(`/api/v1/exams/${exam.id}/date-sheet`, { publish: false })
          toast.success('Date sheet withdrawn. The schedule is editable again.')
          break
        case 'cancel':
          await api.patch(`/api/v1/exams/${exam.id}`, { status: 'CANCELLED' })
          toast.success('Exam cancelled.')
          break
        case 'reopen':
          await api.patch(`/api/v1/exams/${exam.id}`, { status: 'DRAFT' })
          toast.success('Exam returned to draft.')
          break
        case 'delete':
          await api.delete(`/api/v1/exams/${exam.id}`)
          toast.success('Exam deleted.')
          router.push('/admin/exams')
          return
        case 'deletePaper':
          await api.delete(`/api/v1/exams/${exam.id}/papers/${confirm.paperId}`)
          toast.success('Paper removed.')
          break
      }
      setConfirm(null)
      router.refresh()
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmCopy: Record<Confirm['kind'], { title: string; body: React.ReactNode; action: string; danger?: boolean }> = {
    publish: {
      title: 'Publish this date sheet?',
      body: 'Teachers and students will be able to see the schedule. Papers and dates are frozen once it is published — changing them afterwards needs an explicit withdrawal.',
      action: 'Publish date sheet',
    },
    withdraw: {
      title: 'Withdraw this date sheet?',
      body: 'It goes back to draft and the papers become editable again. Anyone who has already seen the schedule will not be told it changed, so tell them yourself.',
      action: 'Withdraw',
      danger: true,
    },
    cancel: {
      title: 'Cancel this exam?',
      body: 'The exam and its papers stay on record, marked cancelled. Nothing is deleted.',
      action: 'Cancel exam',
      danger: true,
    },
    reopen: {
      title: 'Return this exam to draft?',
      body: 'It becomes editable again and can be scheduled as normal.',
      action: 'Return to draft',
    },
    delete: {
      title: 'Delete this exam?',
      body: 'This cannot be undone. It is only possible because nothing has been marked against it — cancel it instead if you want to keep the record.',
      action: 'Delete permanently',
      danger: true,
    },
    deletePaper: {
      title: 'Remove this paper?',
      body: confirm?.kind === 'deletePaper' ? `${confirm.label} will be taken off the schedule.` : '',
      action: 'Remove paper',
      danger: true,
    },
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-foreground-muted">Exam type</dt>
              <dd className="font-medium">{exam.examTypeName}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Academic session</dt>
              <dd className="font-medium">{exam.sessionName}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Dates</dt>
              <dd className="font-medium">
                <DateRange from={exam.startDate} to={exam.endDate} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Status</dt>
              <dd className="mt-0.5">
                <ExamStatusBadge status={exam.status} />
              </dd>
            </div>
          </dl>
        </div>

        {exam.description ? (
          <p className="mt-3 border-t border-border pt-3 text-sm text-foreground-muted">
            {exam.description}
          </p>
        ) : null}

        {canManage ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {editable ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit exam
                </Button>
                <Button size="sm" onClick={() => setConfirm({ kind: 'publish' })}>
                  <Send className="h-4 w-4" aria-hidden />
                  Publish date sheet
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm({ kind: 'cancel' })}
                >
                  <CircleSlash className="h-4 w-4" aria-hidden />
                  Cancel exam
                </Button>
                {!exam.hasMarkingActivity ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'delete' })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete
                  </Button>
                ) : null}
              </>
            ) : null}

            {exam.status === 'SCHEDULED' ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm({ kind: 'withdraw' })}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Withdraw date sheet
              </Button>
            ) : null}

            {exam.status === 'CANCELLED' ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm({ kind: 'reopen' })}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Return to draft
              </Button>
            ) : null}

            {/* Results live on their own screen: generating and publishing them
                is a separate job from configuring the exam. */}
            {published ? (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/admin/exams/${exam.id}/results`}>
                  <Trophy className="h-4 w-4" aria-hidden />
                  Results
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {published ? (
        <Alert variant="success" title="Date sheet published" className="mb-4">
          The schedule is final. Papers and dates cannot be changed while it is published — withdraw
          it first if the schedule genuinely has to change.
        </Alert>
      ) : null}

      {exam.status === 'CANCELLED' ? (
        <Alert variant="warning" title="This exam is cancelled" className="mb-4">
          Its papers are kept on record. Return it to draft to work on it again.
        </Alert>
      ) : null}

      {editable && problems.length > 0 && exam.papers.length > 0 ? (
        <Alert variant="warning" title="Not ready to publish" className="mb-4">
          <ul className="ml-4 list-disc space-y-0.5">
            {problems.map((problem, index) => (
              <li key={`${problem.paperId ?? 'exam'}-${index}`}>{problem.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              { key: 'papers', label: 'Papers' },
              { key: 'schedule', label: 'Date sheet' },
              { key: 'marks', label: 'Mark sheets' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              onClick={() => setTab(option.key)}
              aria-pressed={tab === option.key}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                tab === option.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface text-foreground-muted hover:border-border-strong'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {canManage && editable ? (
          <Button size="sm" onClick={openNewPaper} disabled={options.length === 0}>
            <Plus className="h-4 w-4" aria-hidden />
            Add paper
          </Button>
        ) : null}
      </div>

      {options.length === 0 && editable ? (
        <Alert variant="warning" className="mb-4">
          This session has no academic groups yet, so there are no classes to set papers for. Build
          the session structure first.
        </Alert>
      ) : null}

      {tab === 'marks' ? (
        <MarkSheetMonitor rows={markSheets} />
      ) : tab === 'schedule' ? (
        <DateSheetView groups={dateSheet} />
      ) : (
        <Card>
          {exam.papers.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No papers yet"
              description="Add one paper per subject. A subject every programme in the class sits can be a single paper for the whole class."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH>Class</TH>
                    <TH className="hidden md:table-cell">Programme</TH>
                    <TH className="hidden sm:table-cell whitespace-nowrap">Date</TH>
                    <TH className="hidden lg:table-cell whitespace-nowrap">Time</TH>
                    <TH className="whitespace-nowrap">Max</TH>
                    <TH className="hidden lg:table-cell whitespace-nowrap">Pass %</TH>
                    {canManage && editable ? <TH className="text-right">Actions</TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {exam.papers.map((paper) => (
                    <TR key={paper.id}>
                      <TD className="font-medium">
                        {paper.subjectName}
                        <span className="block text-xs font-normal text-foreground-muted md:hidden">
                          {programLabel(paper.programName)}
                        </span>
                      </TD>
                      <TD>{paper.className}</TD>
                      <TD className="hidden md:table-cell">{programLabel(paper.programName)}</TD>
                      <TD className="hidden sm:table-cell whitespace-nowrap">
                        {formatExamDate(paper.examDate)}
                      </TD>
                      <TD className="hidden lg:table-cell whitespace-nowrap tabular-nums">
                        {formatTimeRange(paper.startTime, paper.endTime)}
                      </TD>
                      <TD className="tabular-nums">{formatMarks(paper.maxMarks)}</TD>
                      <TD className="hidden lg:table-cell tabular-nums">
                        {formatMarks(paper.passingPercentage)}%
                      </TD>
                      {canManage && editable ? (
                        <TD className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditPaper(paper.id)}
                              aria-label={`Edit ${paper.subjectName}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirm({
                                  kind: 'deletePaper',
                                  paperId: paper.id,
                                  label: `${paper.subjectName} (${paper.className})`,
                                })
                              }
                              aria-label={`Remove ${paper.subjectName}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </Card>
      )}

      <ExamFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        examTypes={examTypes}
        sessions={sessions}
        initial={{
          id: exam.id,
          name: exam.name,
          examTypeId: exam.examTypeId,
          academicSessionId: exam.academicSessionId,
          startDate: exam.startDate ?? '',
          endDate: exam.endDate ?? '',
          description: exam.description ?? '',
        }}
      />

      <PaperFormDialog
        open={paperOpen}
        onOpenChange={setPaperOpen}
        examId={exam.id}
        options={options}
        initial={editingPaper}
        examStart={exam.startDate}
        examEnd={exam.endDate}
      />

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null)
            setActionError(null)
          }
        }}
      >
        {confirm ? (
          <DialogContent title={confirmCopy[confirm.kind].title}>
            <div className="space-y-4">
              {actionError ? <Alert variant="danger">{actionError}</Alert> : null}
              <p className="text-sm text-foreground-muted">{confirmCopy[confirm.kind].body}</p>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirm(null)}>
                  Keep as it is
                </Button>
                <Button
                  variant={confirmCopy[confirm.kind].danger ? 'danger' : 'primary'}
                  loading={busy}
                  onClick={runConfirmed}
                >
                  {confirmCopy[confirm.kind].action}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

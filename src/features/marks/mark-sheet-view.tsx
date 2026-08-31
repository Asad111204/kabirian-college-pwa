'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleSlash, Loader2, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { formatExamDate, formatMarks, formatTimeRange } from '@/features/exams/shared'
import { tryHundredths } from '@/server/exams/exact'
import type { MarkSheetDetail } from '@/server/services/marks.service'
import type { MarkStatusValue } from '@/validation/marks'
import { CountsSummary, MarkStatusBadge, type Counts } from './shared'

/**
 * Staff → Exams & Marks → one paper.
 *
 * The three states of a mark are kept apart on the screen exactly as they are
 * in the database: an empty box is **not entered**, a number is **entered**, and
 * Absent is its own control that scores zero. Nothing here infers absence from
 * the number 0, and nothing treats a blank as a mark.
 *
 * Saving is a draft. Submitting is the deliberate, irreversible act, and it is
 * refused while anybody is still unmarked.
 */
export function MarkSheetView({ sheet: initialSheet }: { sheet: MarkSheetDetail }) {
  const router = useRouter()

  const [sheet, setSheet] = React.useState(initialSheet)
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialSheet.marks.map((m) => [m.studentId, m.status === 'ENTERED' ? (m.obtainedMarks ?? '') : '']),
    ),
  )
  const [absent, setAbsent] = React.useState<Set<string>>(
    () => new Set(initialSheet.marks.filter((m) => m.status === 'ABSENT').map((m) => m.studentId)),
  )

  const [search, setSearch] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isDraft = sheet.status === 'DRAFT'
  const editable = sheet.canEdit
  const maxHundredths = tryHundredths(sheet.maxMarks) ?? 0

  /** What each row means right now, from what is on screen. */
  const statusOf = React.useCallback(
    (studentId: string): MarkStatusValue => {
      if (absent.has(studentId)) return 'ABSENT'
      return (values[studentId] ?? '').trim() === '' ? 'PENDING' : 'ENTERED'
    },
    [absent, values],
  )

  /** A mark that could never be saved, so the teacher sees it before the server does. */
  const errorOf = React.useCallback(
    (studentId: string): string | null => {
      if (statusOf(studentId) !== 'ENTERED') return null
      const raw = (values[studentId] ?? '').trim()
      const hundredths = tryHundredths(raw)
      if (hundredths === null) return 'Use a number with at most two decimal places.'
      if (hundredths > maxHundredths) return `The most this paper carries is ${sheet.maxMarks}.`
      return null
    },
    [statusOf, values, maxHundredths, sheet.maxMarks],
  )

  const invalidCount = React.useMemo(
    () => sheet.marks.filter((m) => errorOf(m.studentId) !== null).length,
    [sheet.marks, errorOf],
  )

  const liveCounts = React.useMemo<Counts>(() => {
    const counts = { total: sheet.marks.length, entered: 0, absent: 0, pending: 0 }
    for (const mark of sheet.marks) {
      const status = statusOf(mark.studentId)
      if (status === 'ENTERED') counts.entered += 1
      else if (status === 'ABSENT') counts.absent += 1
      else counts.pending += 1
    }
    return counts
  }, [sheet.marks, statusOf])

  const dirty = React.useMemo(
    () =>
      sheet.marks.some((mark) => {
        const status = statusOf(mark.studentId)
        if (status !== mark.status) return true
        if (status !== 'ENTERED') return false
        return (values[mark.studentId] ?? '').trim() !== (mark.obtainedMarks ?? '')
      }),
    [sheet.marks, statusOf, values],
  )

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sheet.marks
    return sheet.marks.filter(
      (m) =>
        m.fullName.toLowerCase().includes(term) ||
        m.studentCode.toLowerCase().includes(term) ||
        (m.rollNumber ?? '').toLowerCase().includes(term),
    )
  }, [sheet.marks, search])

  function setValue(studentId: string, value: string) {
    setValues((current) => ({ ...current, [studentId]: value }))
    // Typing a mark for someone marked absent means they were not absent.
    if (value.trim() !== '' && absent.has(studentId)) {
      setAbsent((current) => {
        const next = new Set(current)
        next.delete(studentId)
        return next
      })
    }
  }

  function toggleAbsent(studentId: string) {
    setAbsent((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else {
        next.add(studentId)
        // An absence is not a mark, so anything typed is cleared.
        setValues((v) => ({ ...v, [studentId]: '' }))
      }
      return next
    })
  }

  /** Adopts what the server now holds. Only ever called after a success. */
  function adopt(fresh: MarkSheetDetail) {
    setSheet(fresh)
    setValues(
      Object.fromEntries(
        fresh.marks.map((m) => [m.studentId, m.status === 'ENTERED' ? (m.obtainedMarks ?? '') : '']),
      ),
    )
    setAbsent(new Set(fresh.marks.filter((m) => m.status === 'ABSENT').map((m) => m.studentId)))
  }

  function buildRows() {
    return sheet.marks.map((mark) => {
      const status = statusOf(mark.studentId)
      return {
        studentId: mark.studentId,
        status,
        obtainedMarks:
          status === 'ENTERED' ? (values[mark.studentId] ?? '').trim() : status === 'ABSENT' ? '0' : '',
      }
    })
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const fresh = await api.patch<MarkSheetDetail>(`/api/v1/marks/sheets/${sheet.id}`, {
        expectedUpdatedAt: sheet.updatedAt,
        rows: buildRows(),
      })
      adopt(fresh)
      setSavedAt(new Date())
      toast.success('Marks saved.')
      return true
    } catch (err) {
      // Deliberately does NOT adopt or refresh: whatever the teacher typed stays
      // on screen so nothing they entered is lost to a failed request.
      setError(
        err instanceof ApiError ? err.message : 'The marks could not be saved. Nothing was lost — try again.',
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      if (dirty) {
        const fresh = await api.patch<MarkSheetDetail>(`/api/v1/marks/sheets/${sheet.id}`, {
          expectedUpdatedAt: sheet.updatedAt,
          rows: buildRows(),
        })
        adopt(fresh)
      }
      const submitted = await api.post<MarkSheetDetail>(`/api/v1/marks/sheets/${sheet.id}/submit`)
      adopt(submitted)
      setSubmitOpen(false)
      toast.success('Marks submitted.')
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The marks could not be submitted.')
      setSubmitOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  const saveState = saving
    ? { text: 'Saving…', tone: 'text-foreground-muted', Icon: Loader2, spin: true }
    : dirty
      ? { text: 'Unsaved changes', tone: 'text-warning-700', Icon: null, spin: false }
      : savedAt
        ? { text: 'Saved', tone: 'text-success-700', Icon: Check, spin: false }
        : null

  return (
    <>
      <Card className="mb-4 p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground-muted">Exam</dt>
            <dd className="font-medium">{sheet.examName}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Subject</dt>
            <dd className="font-medium">{sheet.subjectName}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Class</dt>
            <dd className="font-medium">
              {sheet.className} · {sheet.divisionName} · {sheet.programName ?? 'All programmes'} ·
              Section {sheet.sectionName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Exam date</dt>
            <dd className="font-medium">
              {formatExamDate(sheet.examDate)}
              {sheet.startTime ? ` · ${formatTimeRange(sheet.startTime, sheet.endTime)}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Maximum marks</dt>
            <dd className="font-medium tabular-nums">{formatMarks(sheet.maxMarks)}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Passing</dt>
            <dd className="font-medium tabular-nums">{formatMarks(sheet.passingPercentage)}%</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Academic session</dt>
            <dd className="font-medium">{sheet.sessionName}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Marks by</dt>
            <dd className="font-medium">{sheet.enteredByName}</dd>
          </div>
        </dl>

        <CountsSummary counts={liveCounts} className="mt-4" />
      </Card>

      {!isDraft ? (
        <Alert variant="success" title="Submitted" className="mb-4">
          Handed in {formatDateTime(sheet.submittedAt)}. Submitted marks cannot be edited. Please
          contact the administrator if a correction is required.
        </Alert>
      ) : null}

      {isDraft && !editable ? (
        <Alert variant="warning" className="mb-4">
          These marks are a draft, but you cannot change them.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="danger" title="Not saved" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <label className="sr-only" htmlFor="mark-search">
            Search students
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden
          />
          <Input
            id="mark-search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or roll number…"
          />
        </div>

        <div className="flex items-center gap-3">
          {saveState ? (
            <span
              className={cn('flex items-center gap-1.5 text-sm', saveState.tone)}
              role="status"
              aria-live="polite"
            >
              {saveState.Icon ? (
                <saveState.Icon
                  className={cn('h-4 w-4', saveState.spin && 'animate-spin')}
                  aria-hidden
                />
              ) : null}
              {saveState.text}
            </span>
          ) : null}

          {editable ? (
            <>
              <Button
                variant="secondary"
                onClick={save}
                loading={saving}
                disabled={!dirty || invalidCount > 0}
              >
                Save draft
              </Button>
              {sheet.canSubmit ? (
                <Button
                  onClick={() => setSubmitOpen(true)}
                  disabled={saving || invalidCount > 0 || liveCounts.pending > 0}
                >
                  <Send className="h-4 w-4" aria-hidden />
                  Submit
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {editable && liveCounts.pending > 0 ? (
        <Alert variant="info" className="mb-3">
          {liveCounts.pending} student{liveCounts.pending === 1 ? ' has' : 's have'} no mark yet.
          Enter a mark, or mark them absent, before you can submit.
        </Alert>
      ) : null}

      <Card>
        {sheet.marks.length === 0 ? (
          <EmptyState
            title="No students in this section"
            description="Nobody is actively enrolled, so there is nothing to mark. Ask the office to check the enrollments."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="No students match that search" />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH className="w-16">Roll</TH>
                  <TH>Student</TH>
                  <TH className="hidden sm:table-cell">Code</TH>
                  <TH className="w-32">Marks</TH>
                  {/* The Absent control only exists while the sheet can be
                      edited; a read-only row says the same thing once, in the
                      status column. */}
                  {editable ? <TH className="w-28">Absent</TH> : null}
                  <TH className={editable ? 'hidden md:table-cell' : undefined}>Status</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((mark) => {
                  const status = statusOf(mark.studentId)
                  const rowError = errorOf(mark.studentId)
                  const isAbsent = status === 'ABSENT'

                  return (
                    <TR key={mark.studentId}>
                      <TD className="tabular-nums text-foreground-muted">
                        {mark.rollNumber ?? '—'}
                      </TD>
                      <TD className="font-medium">
                        {mark.fullName}
                        <span className="block text-xs font-normal text-foreground-muted sm:hidden">
                          {mark.studentCode}
                        </span>
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">
                          {mark.studentCode}
                        </code>
                      </TD>
                      <TD>
                        {editable ? (
                          <>
                            <Input
                              inputMode="decimal"
                              aria-label={`Marks for ${mark.fullName}`}
                              aria-invalid={rowError ? true : undefined}
                              value={values[mark.studentId] ?? ''}
                              onChange={(e) => setValue(mark.studentId, e.target.value)}
                              disabled={isAbsent}
                              placeholder={isAbsent ? '0' : '—'}
                              className={cn(
                                'h-9 w-24 tabular-nums',
                                rowError && 'border-danger-600',
                              )}
                            />
                            {rowError ? (
                              <span className="mt-1 block text-xs text-danger-700">{rowError}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="tabular-nums">
                            {status === 'ENTERED' ? formatMarks(mark.obtainedMarks ?? '') : '—'}
                          </span>
                        )}
                      </TD>
                      {editable ? (
                        <TD>
                          <button
                            type="button"
                            aria-pressed={isAbsent}
                            aria-label={`Mark ${mark.fullName} absent`}
                            onClick={() => toggleAbsent(mark.studentId)}
                            className={cn(
                              'inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-xs font-medium transition-colors',
                              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                              isAbsent
                                ? 'border-danger-600 bg-danger-600 text-white'
                                : 'border-border text-foreground-muted hover:border-border-strong hover:text-foreground',
                            )}
                          >
                            <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Absent
                          </button>
                        </TD>
                      ) : null}
                      <TD className={editable ? 'hidden md:table-cell' : undefined}>
                        <MarkStatusBadge status={status} />
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent title="Submit marks?">
          <div className="space-y-4">
            <p className="text-sm text-foreground-muted">
              Once submitted, you will not be able to edit this mark sheet. A correction afterwards
              has to go through the office.
            </p>
            <CountsSummary counts={liveCounts} />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSubmitOpen(false)}>
                Keep working
              </Button>
              <Button onClick={submit} loading={submitting}>
                Submit marks
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

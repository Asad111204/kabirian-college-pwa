'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, RotateCcw, Search, Send, Trophy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { RESULT_OUTCOMES, RESULT_OUTCOME_LABEL } from '@/validation/results'
import type { GenerationPreview, ResultRow } from '@/server/services/results.service'
import { ResultDetailDialog } from './result-detail-dialog'
import {
  marksLabel,
  OutcomeBadge,
  percentageLabel,
  positionLabel,
  ResultStatusBadge,
  SummaryTiles,
  type Summary,
} from './shared'

export interface ResultFilters {
  search: string
  classId: string
  programId: string
  sectionId: string
  outcome: string
  status: string
}

export interface GroupOption {
  classId: string
  className: string
  programId: string
  programName: string
  sections: { id: string; name: string; divisionName: string }[]
}

type Confirm = { kind: 'generate' } | { kind: 'regenerate' } | { kind: 'publish' } | { kind: 'withdraw' }

/**
 * Admin → one exam → Results.
 *
 * Generation, review and publication on one screen, because they are one job:
 * an administrator generates, reads what came out, and only then decides to
 * publish. Filtering and paging happen on the server, so an exam with thousands
 * of students never sends all of them to a browser.
 */
export function ResultsReview({
  preview,
  summary,
  results,
  page,
  pageSize,
  total,
  totalPages,
  filters,
  groups,
  canGenerate,
  canPublish,
}: {
  preview: GenerationPreview
  summary: Summary
  results: ResultRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: ResultFilters
  groups: GroupOption[]
  canGenerate: boolean
  canPublish: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [searchText, setSearchText] = React.useState(filters.search)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [blockers, setBlockers] = React.useState<string[] | null>(null)
  const [openResultId, setOpenResultId] = React.useState<string | null>(null)

  // Derived, not stored in an effect: the box shows what the server was asked
  // for until the person types something different.
  const [lastSearch, setLastSearch] = React.useState(filters.search)
  if (filters.search !== lastSearch) {
    setLastSearch(filters.search)
    setSearchText(filters.search)
  }

  const applyFilters = React.useCallback(
    (changes: Partial<ResultFilters> & { page?: number }) => {
      const merged: Record<string, string | number | undefined> = { ...filters, page, ...changes }
      if (!('page' in changes)) merged.page = 1
      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === '') continue
        if (key === 'page' && value === 1) continue
        next.set(key, String(value))
      }
      const query = next.toString()
      startTransition(() =>
        router.push(
          query
            ? `/admin/exams/${preview.examId}/results?${query}`
            : `/admin/exams/${preview.examId}/results`,
        ),
      )
    },
    [filters, page, router, preview.examId],
  )

  const classes = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const group of groups) seen.set(group.classId, group.className)
    return [...seen.entries()]
  }, [groups])

  const programs = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const group of groups) {
      if (filters.classId && group.classId !== filters.classId) continue
      seen.set(group.programId, group.programName)
    }
    return [...seen.entries()]
  }, [groups, filters.classId])

  const sections = React.useMemo(() => {
    const list: [string, string][] = []
    for (const group of groups) {
      if (filters.classId && group.classId !== filters.classId) continue
      if (filters.programId && group.programId !== filters.programId) continue
      for (const section of group.sections) {
        list.push([section.id, `${group.programName} · ${section.divisionName} · ${section.name}`])
      }
    }
    return list
  }, [groups, filters.classId, filters.programId])

  const hasFilter =
    filters.search !== '' ||
    filters.classId !== '' ||
    filters.programId !== '' ||
    filters.sectionId !== '' ||
    filters.outcome !== '' ||
    filters.status !== ''

  const ready = preview.blockers.length === 0
  const generated = preview.existing !== null
  const allPublished = generated && preview.existing!.published === preview.existing!.total

  async function run() {
    if (!confirm) return
    setBusy(true)
    setError(null)
    setBlockers(null)
    try {
      if (confirm.kind === 'generate' || confirm.kind === 'regenerate') {
        const outcome = await api.post<{ generated: number; version: number }>(
          `/api/v1/exams/${preview.examId}/results/generate`,
          { regenerate: confirm.kind === 'regenerate', reason: reason.trim() || undefined },
        )
        toast.success(
          `${outcome.generated} result${outcome.generated === 1 ? '' : 's'} generated (version ${outcome.version}).`,
        )
      } else {
        await api.patch(`/api/v1/exams/${preview.examId}/results/publish`, {
          publish: confirm.kind === 'publish',
        })
        toast.success(confirm.kind === 'publish' ? 'Results published.' : 'Results withdrawn.')
      }
      setConfirm(null)
      setReason('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.fields?.markSheets) setBlockers(err.fields.markSheets)
      } else {
        setError('Something went wrong. Please try again.')
      }
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const copy: Record<Confirm['kind'], { title: string; body: React.ReactNode; action: string; danger?: boolean; askReason?: boolean }> = {
    generate: {
      title: 'Generate results?',
      body: `Every figure will be worked out from the submitted marks for ${preview.studentCount} student${preview.studentCount === 1 ? '' : 's'}. Nothing becomes visible to anyone until you publish.`,
      action: 'Generate results',
    },
    regenerate: {
      title: 'Regenerate results?',
      body: 'The existing results are kept as an earlier version and a new one is written. Anything already published stops being published until you publish again.',
      action: 'Regenerate',
      danger: true,
      askReason: true,
    },
    publish: {
      title: 'Publish results?',
      body: 'Published results will become visible to students and staff.',
      action: 'Publish results',
    },
    withdraw: {
      title: 'Withdraw published results?',
      body: 'They stop being visible to students and staff. Anyone who has already seen theirs will not be told it was withdrawn.',
      action: 'Withdraw',
      danger: true,
    },
  }

  return (
    <>
      {/* ---- generation ---- */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-foreground-muted">Papers</dt>
              <dd className="font-medium tabular-nums">{preview.paperCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Sections</dt>
              <dd className="font-medium tabular-nums">{preview.sectionCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Students</dt>
              <dd className="font-medium tabular-nums">{preview.studentCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Mark sheets in</dt>
              <dd className="font-medium tabular-nums">
                {preview.submittedSheets} of {preview.submittedSheets + preview.pendingSheets}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Ranking</dt>
              <dd className="font-medium">
                {preview.rankingScope === 'SECTION'
                  ? 'Per section'
                  : preview.rankingScope === 'CLASS'
                    ? 'Per class and programme'
                    : 'Per class, division and programme'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {canGenerate ? (
            generated ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirm({ kind: 'regenerate' })}
                disabled={!ready}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Regenerate
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirm({ kind: 'generate' })} disabled={!ready}>
                <Calculator className="h-4 w-4" aria-hidden />
                Generate results
              </Button>
            )
          ) : null}

          {canPublish && generated ? (
            allPublished ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm({ kind: 'withdraw' })}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Withdraw
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirm({ kind: 'publish' })}>
                <Send className="h-4 w-4" aria-hidden />
                Publish results
              </Button>
            )
          ) : null}

          {generated ? (
            <p className="self-center text-xs text-foreground-muted">
              Version {preview.existing!.latestVersion} · generated{' '}
              {formatDateTime(preview.existing!.generatedAt)}
              {preview.existing!.published > 0
                ? ` · ${preview.existing!.published} published`
                : ' · not published'}
            </p>
          ) : null}
        </div>
      </Card>

      {error ? (
        <Alert variant="danger" title="Could not do that" className="mb-4">
          <p>{error}</p>
          {blockers ? (
            <ul className="mt-2 ml-4 list-disc space-y-0.5">
              {blockers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      {!ready ? (
        <Alert variant="warning" title="Marks are still coming in" className="mb-4">
          <p>
            {preview.blockers.length} mark sheet{preview.blockers.length === 1 ? '' : 's'} must be
            submitted before results can be generated. Partial official results are never produced.
          </p>
          <ul className="mt-2 ml-4 list-disc space-y-0.5">
            {preview.blockers.slice(0, 12).map((blocker) => (
              <li key={`${blocker.examPaperId}:${blocker.sectionId}`}>
                {blocker.subjectName} · {blocker.className} {blocker.divisionName}{' '}
                {blocker.sectionName} — {blocker.status === 'MISSING' ? 'not started' : 'still a draft'}
              </li>
            ))}
            {preview.blockers.length > 12 ? <li>…and {preview.blockers.length - 12} more.</li> : null}
          </ul>
        </Alert>
      ) : null}

      {preview.gradeScaleName === null ? (
        <Alert variant="warning" title="No default grading scale" className="mb-4">
          Results cannot be graded until a default grading scale is configured.
        </Alert>
      ) : null}

      {/* ---- summary ---- */}
      {generated ? <SummaryTiles summary={summary} className="mb-4" /> : null}

      {/* ---- filters ---- */}
      {generated ? (
        <Card className="mb-4 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sr-only" htmlFor="f-class">
              Class
            </label>
            <Select
              id="f-class"
              value={filters.classId}
              onChange={(e) =>
                applyFilters({ classId: e.target.value, programId: '', sectionId: '' })
              }
            >
              <option value="">All classes</option>
              {classes.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>

            <label className="sr-only" htmlFor="f-program">
              Programme
            </label>
            <Select
              id="f-program"
              value={filters.programId}
              onChange={(e) => applyFilters({ programId: e.target.value, sectionId: '' })}
            >
              <option value="">All programmes</option>
              {programs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>

            <label className="sr-only" htmlFor="f-section">
              Section
            </label>
            <Select
              id="f-section"
              value={filters.sectionId}
              onChange={(e) => applyFilters({ sectionId: e.target.value })}
            >
              <option value="">All sections</option>
              {sections.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>

            <label className="sr-only" htmlFor="f-outcome">
              Result
            </label>
            <Select
              id="f-outcome"
              value={filters.outcome}
              onChange={(e) => applyFilters({ outcome: e.target.value })}
            >
              <option value="">All results</option>
              {RESULT_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {RESULT_OUTCOME_LABEL[outcome]}
                </option>
              ))}
            </Select>

            <form
              className="relative sm:col-span-2 lg:col-span-3"
              onSubmit={(e) => {
                e.preventDefault()
                applyFilters({ search: searchText.trim() })
              }}
            >
              <label className="sr-only" htmlFor="f-search">
                Search students
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
                aria-hidden
              />
              <Input
                id="f-search"
                className="pl-9"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by name, code or roll number…"
              />
            </form>

            <label className="sr-only" htmlFor="f-status">
              Status
            </label>
            <Select
              id="f-status"
              value={filters.status}
              onChange={(e) => applyFilters({ status: e.target.value })}
            >
              <option value="">Generated and published</option>
              <option value="DRAFT">Generated only</option>
              <option value="PUBLISHED">Published only</option>
            </Select>
          </div>

          {hasFilter ? (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchText('')
                  applyFilters({
                    search: '',
                    classId: '',
                    programId: '',
                    sectionId: '',
                    outcome: '',
                    status: '',
                  })
                }}
              >
                <X className="h-4 w-4" aria-hidden />
                Clear filters
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ---- the table ---- */}
      <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {!generated ? (
          <EmptyState
            icon={Trophy}
            title="No results generated yet"
            description={
              ready
                ? 'Every mark sheet is in. Generate the results when you are ready — nothing becomes visible to anyone until you publish.'
                : 'Results are worked out once every mark sheet has been submitted.'
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No results match these filters"
            description="Try a different class, programme, section or outcome."
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-16">Position</TH>
                    <TH>Student</TH>
                    <TH className="hidden lg:table-cell">Class &amp; section</TH>
                    <TH className="text-right">Marks</TH>
                    <TH className="hidden sm:table-cell text-right">%</TH>
                    <TH className="hidden sm:table-cell">Grade</TH>
                    <TH>Result</TH>
                    <TH className="hidden md:table-cell">Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {results.map((result) => (
                    <TR key={result.id}>
                      <TD className="tabular-nums text-foreground-muted">
                        {positionLabel(result.position)}
                      </TD>
                      <TD>
                        <button
                          type="button"
                          onClick={() => setOpenResultId(result.id)}
                          className="text-left font-medium text-primary hover:underline"
                        >
                          {result.studentName}
                        </button>
                        <span className="block text-xs text-foreground-muted">
                          {result.studentCode}
                          {result.rollNumber ? ` · Roll ${result.rollNumber}` : ''}
                        </span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {result.className} · {result.divisionName} · {result.programName} ·{' '}
                        {result.sectionName}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {marksLabel(result.totalObtainedMarks)} /{' '}
                        {marksLabel(result.totalMaxMarks)}
                      </TD>
                      <TD className="hidden sm:table-cell text-right tabular-nums">
                        {percentageLabel(result.percentage)}
                      </TD>
                      <TD className="hidden sm:table-cell">{result.grade ?? '—'}</TD>
                      <TD>
                        <OutcomeBadge outcome={result.outcome} />
                      </TD>
                      <TD className="hidden md:table-cell">
                        <ResultStatusBadge status={result.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={(next) => applyFilters({ page: next })}
              disabled={pending}
            />
          </>
        )}
      </Card>

      <ResultDetailDialog resultId={openResultId} onClose={() => setOpenResultId(null)} />

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
      >
        {confirm ? (
          <DialogContent title={copy[confirm.kind].title}>
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted">{copy[confirm.kind].body}</p>

              {copy[confirm.kind].askReason ? (
                <div>
                  <label htmlFor="reason" className="mb-1 block text-sm font-medium">
                    Why is this being regenerated?
                  </label>
                  <Textarea
                    id="reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Recorded against the new version."
                  />
                </div>
              ) : null}

              {confirm.kind === 'regenerate' && preview.existing!.published > 0 ? (
                <Alert variant="warning">
                  {preview.existing!.published} published result
                  {preview.existing!.published === 1 ? '' : 's'} will stop being visible until you
                  publish the new version.
                </Alert>
              ) : null}

              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant={copy[confirm.kind].danger ? 'danger' : 'primary'}
                  loading={busy}
                  onClick={run}
                >
                  {copy[confirm.kind].action}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

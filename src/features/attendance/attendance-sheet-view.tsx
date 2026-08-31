'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CircleSlash, Pencil, Save, Search, Send, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/format'
import { ATTENDANCE_STATUS_LABEL } from '@/validation/attendance'
import {
  AttendanceSummaryTiles,
  STATUS_ORDER,
  SheetStatusBadge,
  StatusPicker,
  subjectLabel,
  type AttendanceCounts,
  type AttendanceStatusValue,
  type SheetStatusValue,
} from './shared'

export interface RosterEntry {
  id: string
  studentId: string
  studentCode: string
  fullName: string
  fatherName: string | null
  rollNumber: string | null
  status: AttendanceStatusValue
  remarks: string | null
}

export interface SheetDetail {
  id: string
  date: string
  period: number
  status: SheetStatusValue
  sectionName: string
  className: string
  divisionName: string
  programName: string
  subjectName: string | null
  markedByName: string
  submittedAt: string | null
  cancelledReason: string | null
  studentCount: number
  counts: AttendanceCounts
  percentage: number | null
  entries: RosterEntry[]
}

/**
 * One attendance register.
 *
 * The whole screen is driven by what the server said: whether it is a draft,
 * whether this administrator may correct a submitted register, what the summary
 * is. Buttons are hidden when an action is not allowed — but that is a courtesy,
 * not the control. Every action calls the API, which decides again.
 */
export function AttendanceSheetView({
  sheet: initialSheet,
  canUpdate,
  canUpdateSubmitted,
}: {
  sheet: SheetDetail
  canUpdate: boolean
  canUpdateSubmitted: boolean
}) {
  const router = useRouter()
  const [sheet, setSheet] = React.useState(initialSheet)
  const [marks, setMarks] = React.useState<Record<string, AttendanceStatusValue>>(() =>
    Object.fromEntries(initialSheet.entries.map((e) => [e.studentId, e.status])),
  )
  const [remarks, setRemarks] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(initialSheet.entries.map((e) => [e.studentId, e.remarks ?? ''])),
  )
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState('')

  const [saving, setSaving] = React.useState(false)
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [cancelling, setCancelling] = React.useState(false)
  const [correcting, setCorrecting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isDraft = sheet.status === 'DRAFT'
  const isSubmitted = sheet.status === 'SUBMITTED'
  const isCancelled = sheet.status === 'CANCELLED'

  /**
   * Editing is open on a draft, and on a submitted register only while the
   * administrator has explicitly turned correction on — so a stray click cannot
   * quietly alter a register that has already been handed in.
   */
  const editable = canUpdate && (isDraft || (isSubmitted && canUpdateSubmitted && correcting))

  const dirty = React.useMemo(
    () =>
      sheet.entries.some(
        (e) => marks[e.studentId] !== e.status || (remarks[e.studentId] ?? '') !== (e.remarks ?? ''),
      ),
    [sheet.entries, marks, remarks],
  )

  /** Counts recomputed from what is on screen, so the tiles follow the marking. */
  const liveCounts = React.useMemo<AttendanceCounts>(() => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0 }
    for (const entry of sheet.entries) {
      const status = marks[entry.studentId] ?? entry.status
      if (status === 'PRESENT') counts.present += 1
      else if (status === 'ABSENT') counts.absent += 1
      else if (status === 'LATE') counts.late += 1
      else counts.leave += 1
    }
    return counts
  }, [sheet.entries, marks])

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sheet.entries
    return sheet.entries.filter(
      (e) =>
        e.fullName.toLowerCase().includes(term) ||
        e.studentCode.toLowerCase().includes(term) ||
        (e.rollNumber ?? '').toLowerCase().includes(term),
    )
  }, [sheet.entries, search])

  function setStatus(studentId: string, status: AttendanceStatusValue) {
    setMarks((current) => ({ ...current, [studentId]: status }))
  }

  /** Bulk marking. The table updates immediately, so nothing changes unseen. */
  function markMany(studentIds: string[], status: AttendanceStatusValue) {
    if (studentIds.length === 0) return
    setMarks((current) => {
      const next = { ...current }
      for (const id of studentIds) next[id] = status
      return next
    })
    toast.success(
      `${studentIds.length} student${studentIds.length === 1 ? '' : 's'} marked ${ATTENDANCE_STATUS_LABEL[status].toLowerCase()}. Not saved yet.`,
    )
  }

  async function refresh() {
    try {
      const fresh = await api.get<SheetDetail>(`/api/v1/attendance/sheets/${sheet.id}`)
      setSheet(fresh)
      setMarks(Object.fromEntries(fresh.entries.map((e) => [e.studentId, e.status])))
      setRemarks(Object.fromEntries(fresh.entries.map((e) => [e.studentId, e.remarks ?? ''])))
      setSelected(new Set())
    } catch {
      router.refresh()
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/v1/attendance/sheets/${sheet.id}`, {
        entries: sheet.entries.map((e) => ({
          studentId: e.studentId,
          status: marks[e.studentId] ?? e.status,
          remarks: remarks[e.studentId] || undefined,
        })),
      })
      toast.success('Attendance saved.')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The attendance could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      if (dirty) {
        await api.patch(`/api/v1/attendance/sheets/${sheet.id}`, {
          entries: sheet.entries.map((e) => ({
            studentId: e.studentId,
            status: marks[e.studentId] ?? e.status,
            remarks: remarks[e.studentId] || undefined,
          })),
        })
      }
      await api.post(`/api/v1/attendance/sheets/${sheet.id}/submit`)
      toast.success('Attendance submitted. It now counts towards percentages.')
      setSubmitOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The attendance could not be submitted.')
      setSubmitOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    try {
      await api.post(`/api/v1/attendance/sheets/${sheet.id}/cancel`, {
        cancelledReason: cancelReason,
      })
      toast.success('Register cancelled. It no longer counts towards any percentage.')
      setCancelOpen(false)
      setCancelReason('')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The register could not be cancelled.')
    } finally {
      setCancelling(false)
    }
  }

  const allVisibleIds = visible.map((e) => e.studentId)
  const selectedVisible = allVisibleIds.filter((id) => selected.has(id))

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/attendance">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All registers
          </Link>
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {subjectLabel(sheet.subjectName)}
              <SheetStatusBadge status={sheet.status} />
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {sheet.className} · {sheet.divisionName} · {sheet.programName} · Section{' '}
              {sheet.sectionName}
            </p>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {formatDate(sheet.date)} · Period {sheet.period} · Taken by {sheet.markedByName}
            </p>
            {sheet.submittedAt ? (
              <p className="mt-0.5 text-xs text-foreground-subtle">
                Submitted {formatDateTime(sheet.submittedAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button variant="secondary" onClick={handleSave} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" aria-hidden />
                Save
              </Button>
            ) : null}

            {isDraft && canUpdate ? (
              <Button onClick={() => setSubmitOpen(true)}>
                <Send className="h-4 w-4" aria-hidden />
                Submit attendance
              </Button>
            ) : null}

            {isSubmitted && canUpdateSubmitted && !correcting ? (
              <Button variant="secondary" onClick={() => setCorrecting(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Correct attendance
              </Button>
            ) : null}

            {isSubmitted && correcting ? (
              <Button variant="ghost" onClick={() => setCorrecting(false)}>
                Done correcting
              </Button>
            ) : null}

            {!isCancelled && canUpdate ? (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                <CircleSlash className="h-4 w-4" aria-hidden />
                Cancel register
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {error ? (
        <Alert variant="danger" className="mb-4" title="That did not work">
          {error}
        </Alert>
      ) : null}

      {isCancelled ? (
        <Alert variant="warning" className="mb-4" title="This class was cancelled">
          {sheet.cancelledReason ?? 'No reason was recorded.'} It does not count towards any
          student&rsquo;s attendance percentage, and the marks below are kept only as a record.
        </Alert>
      ) : null}

      {isSubmitted && !correcting ? (
        <Alert variant="info" className="mb-4" title="Submitted">
          This register has been handed in and counts towards attendance percentages.
          {canUpdateSubmitted
            ? ' Use “Correct attendance” to change a mark — corrections are recorded.'
            : ' Only the office can change it now.'}
        </Alert>
      ) : null}

      {isSubmitted && correcting ? (
        <Alert variant="warning" className="mb-4" title="Correcting a submitted register">
          Every change you make here is recorded against your account.
        </Alert>
      ) : null}

      <div className="mb-4">
        <AttendanceSummaryTiles
          counts={liveCounts}
          total={sheet.studentCount}
          percentage={sheet.percentage}
          countsTowardsPercentage={isSubmitted}
        />
      </div>

      {sheet.entries.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students on this register"
          description="No students are enrolled in this section."
          action={
            <Button variant="secondary" asChild>
              <Link href="/admin/students">Go to Students</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this register…"
                className="pl-9"
                aria-label="Search students on this register"
              />
            </div>

            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => markMany(sheet.entries.map((e) => e.studentId), 'PRESENT')}
                >
                  Mark all present
                </Button>
                <span className="text-xs text-foreground-muted" aria-live="polite">
                  {selectedVisible.length} selected
                </span>
                {STATUS_ORDER.map((status) => (
                  <Button
                    key={status}
                    variant="ghost"
                    size="sm"
                    disabled={selectedVisible.length === 0}
                    onClick={() => markMany(selectedVisible, status)}
                  >
                    {ATTENDANCE_STATUS_LABEL[status]}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  {editable ? (
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all students shown"
                        checked={selectedVisible.length > 0 && selectedVisible.length === allVisibleIds.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(allVisibleIds) : new Set())
                        }
                        className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]"
                      />
                    </TH>
                  ) : null}
                  <TH className="w-12">#</TH>
                  <TH>Student</TH>
                  <TH>Status</TH>
                  <TH>Remarks</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((entry, index) => (
                  <TR key={entry.id}>
                    {editable ? (
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.fullName}`}
                          checked={selected.has(entry.studentId)}
                          onChange={(e) => {
                            setSelected((current) => {
                              const next = new Set(current)
                              if (e.target.checked) next.add(entry.studentId)
                              else next.delete(entry.studentId)
                              return next
                            })
                          }}
                          className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]"
                        />
                      </TD>
                    ) : null}
                    <TD className="tabular-nums text-foreground-muted">
                      {entry.rollNumber ?? index + 1}
                    </TD>
                    <TD>
                      <p className="font-medium">{entry.fullName}</p>
                      <p className="text-xs text-foreground-muted">
                        {entry.studentCode}
                        {entry.fatherName ? ` · ${entry.fatherName}` : ''}
                      </p>
                    </TD>
                    <TD>
                      {editable ? (
                        <StatusPicker
                          value={marks[entry.studentId] ?? entry.status}
                          onChange={(status) => setStatus(entry.studentId, status)}
                          studentName={entry.fullName}
                        />
                      ) : (
                        <span className="text-sm">
                          {ATTENDANCE_STATUS_LABEL[marks[entry.studentId] ?? entry.status]}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {editable ? (
                        <Input
                          value={remarks[entry.studentId] ?? ''}
                          onChange={(e) =>
                            setRemarks((current) => ({
                              ...current,
                              [entry.studentId]: e.target.value,
                            }))
                          }
                          placeholder="Optional"
                          aria-label={`Remarks for ${entry.fullName}`}
                          className="h-9 text-sm"
                        />
                      ) : (
                        <span className="text-sm text-foreground-muted">
                          {entry.remarks || '—'}
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          {visible.length === 0 ? (
            <EmptyState title={`No students match “${search}”`} description="Try a different search." />
          ) : null}
        </Card>
      )}

      {/* Submit, with the figures spelled out before anything is committed. */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent
          title="Submit this attendance?"
          description="Once submitted it counts towards attendance percentages, and teachers can no longer change it."
        >
          <dl className="space-y-1 rounded-[var(--radius-control)] border border-border p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Students</dt>
              <dd className="font-medium tabular-nums">{sheet.studentCount}</dd>
            </div>
            {STATUS_ORDER.map((status) => {
              const value =
                status === 'PRESENT'
                  ? liveCounts.present
                  : status === 'ABSENT'
                    ? liveCounts.absent
                    : status === 'LATE'
                      ? liveCounts.late
                      : liveCounts.leave
              return (
                <div key={status} className="flex justify-between">
                  <dt className="text-foreground-muted">{ATTENDANCE_STATUS_LABEL[status]}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              )
            })}
          </dl>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>
              Keep editing
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Submit attendance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel, which requires a reason. */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent
          title="Cancel this register?"
          description="Use this when the class did not happen."
        >
          <div className="space-y-3">
            <Alert variant="info">
              Cancelled attendance will not count towards attendance percentages. Nothing is
              deleted — the marks stay on record.
            </Alert>

            <div>
              <label htmlFor="cancel-reason" className="text-sm font-medium">
                Reason <span className="text-danger-600">*</span>
              </label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Public holiday, exam in progress"
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep the register
            </Button>
            <Button
              variant="danger"
              onClick={handleCancel}
              loading={cancelling}
              disabled={cancelReason.trim().length < 3}
            >
              Cancel register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

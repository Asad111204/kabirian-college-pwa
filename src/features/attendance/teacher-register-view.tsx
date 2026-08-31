'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, Keyboard, Save, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/format'
import { ATTENDANCE_STATUS_LABEL } from '@/validation/attendance'
import {
  STATUS_ORDER,
  SheetStatusBadge,
  StatusPicker,
  subjectLabel,
  type AttendanceStatusValue,
  type SheetStatusValue,
} from './shared'

export interface TeacherRegisterEntry {
  id: string
  studentId: string
  studentCode: string
  fullName: string
  rollNumber: string | null
  status: AttendanceStatusValue
  remarks: string | null
}

export interface TeacherRegister {
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
  entries: TeacherRegisterEntry[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** Keys a teacher can press while a student row has focus. */
const SHORTCUTS: Record<string, AttendanceStatusValue> = {
  p: 'PRESENT',
  a: 'ABSENT',
  l: 'LATE',
  e: 'LEAVE',
}

/**
 * A teacher's register.
 *
 * Deliberately narrower than the admin screen: mark, save, submit. No cancel, no
 * correction, no filters — the office does those. Built for a phone held in one
 * hand at the front of a classroom.
 */
export function TeacherRegisterView({
  register: initial,
  canUpdate,
}: {
  register: TeacherRegister
  canUpdate: boolean
}) {
  const router = useRouter()
  const [register, setRegister] = React.useState(initial)
  const [marks, setMarks] = React.useState<Record<string, AttendanceStatusValue>>(() =>
    Object.fromEntries(initial.entries.map((e) => [e.studentId, e.status])),
  )
  /**
   * Which students the teacher has actually looked at.
   *
   * The register arrives with everyone marked Present, which is how a paper
   * register works — but "nobody has checked it yet" and "everyone was present"
   * look identical. Tracking what has been touched lets the submit step say
   * which students still carry the default, without inventing a status the
   * database does not have.
   */
  const [reviewed, setReviewed] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState('')
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isDraft = register.status === 'DRAFT'
  const isSubmitted = register.status === 'SUBMITTED'
  const isCancelled = register.status === 'CANCELLED'
  const editable = canUpdate && isDraft

  const dirty = React.useMemo(
    () => register.entries.some((e) => marks[e.studentId] !== e.status),
    [register.entries, marks],
  )

  /** Warn before losing marks to a refresh or a closed tab. */
  React.useEffect(() => {
    if (!dirty || !editable) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, editable])

  const counts = React.useMemo(() => {
    const totals = { present: 0, absent: 0, late: 0, leave: 0 }
    for (const entry of register.entries) {
      const status = marks[entry.studentId] ?? entry.status
      if (status === 'PRESENT') totals.present += 1
      else if (status === 'ABSENT') totals.absent += 1
      else if (status === 'LATE') totals.late += 1
      else totals.leave += 1
    }
    return totals
  }, [register.entries, marks])

  const unreviewed = register.entries.filter((e) => !reviewed.has(e.studentId)).length

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return register.entries
    return register.entries.filter(
      (e) =>
        e.fullName.toLowerCase().includes(term) ||
        e.studentCode.toLowerCase().includes(term) ||
        (e.rollNumber ?? '').toLowerCase().includes(term),
    )
  }, [register.entries, search])

  function setStatus(studentId: string, status: AttendanceStatusValue) {
    setMarks((current) => ({ ...current, [studentId]: status }))
    setReviewed((current) => new Set(current).add(studentId))
    setSaveState('idle')
  }

  function markAllPresent() {
    setMarks(Object.fromEntries(register.entries.map((e) => [e.studentId, 'PRESENT' as const])))
    setReviewed(new Set(register.entries.map((e) => e.studentId)))
    setSaveState('idle')
    toast.success('Everyone marked present. Change the ones who were not, then submit.')
  }

  function payload() {
    return {
      entries: register.entries.map((e) => ({
        studentId: e.studentId,
        status: marks[e.studentId] ?? e.status,
      })),
    }
  }

  async function save(): Promise<boolean> {
    setSaveState('saving')
    setError(null)
    try {
      await api.patch(`/api/v1/attendance/sheets/${register.id}`, payload())
      // Only now is anything actually stored.
      setRegister((current) => ({
        ...current,
        entries: current.entries.map((e) => ({ ...e, status: marks[e.studentId] ?? e.status })),
      }))
      setSaveState('saved')
      return true
    } catch (err) {
      setSaveState('failed')
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to save attendance. Please check your connection.',
      )
      return false
    }
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      if (dirty) {
        await api.patch(`/api/v1/attendance/sheets/${register.id}`, payload())
      }
      const updated = await api.post<TeacherRegister>(
        `/api/v1/attendance/sheets/${register.id}/submit`,
      )
      setRegister(updated)
      setMarks(Object.fromEntries(updated.entries.map((e) => [e.studentId, e.status])))
      setSubmitOpen(false)
      setSaveState('idle')
      toast.success('Attendance submitted.')
      router.refresh()
    } catch (err) {
      setSubmitOpen(false)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to submit attendance. Please check your connection.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/staff/attendance">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            My attendance
          </Link>
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {subjectLabel(register.subjectName)}
              <SheetStatusBadge status={register.status} />
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {register.className} · {register.divisionName} · {register.programName} · Section{' '}
              {register.sectionName}
            </p>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {formatDate(register.date)} · Period {register.period}
            </p>
            {register.submittedAt ? (
              <p className="mt-0.5 text-xs text-foreground-subtle">
                Submitted {formatDateTime(register.submittedAt)}
              </p>
            ) : null}
          </div>

          <dl className="flex flex-wrap gap-3 text-sm">
            {[
              ['Total', register.studentCount],
              [ATTENDANCE_STATUS_LABEL.PRESENT, counts.present],
              [ATTENDANCE_STATUS_LABEL.ABSENT, counts.absent],
              [ATTENDANCE_STATUS_LABEL.LATE, counts.late],
              [ATTENDANCE_STATUS_LABEL.LEAVE, counts.leave],
            ].map(([label, value]) => (
              <div key={String(label)} className="text-center">
                <dt className="text-xs text-foreground-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {error ? (
        <Alert variant="danger" className="mb-4" title="That did not work">
          {error}
        </Alert>
      ) : null}

      {isDraft ? (
        <Alert variant="warning" className="mb-4" title="Draft — not submitted yet">
          This attendance does not count towards anyone&rsquo;s percentage until you submit it.
        </Alert>
      ) : null}

      {isSubmitted ? (
        <Alert variant="success" className="mb-4" title="Attendance submitted">
          Submitted attendance cannot be edited. Please contact the office if something needs
          correcting.
        </Alert>
      ) : null}

      {isCancelled ? (
        <Alert variant="warning" className="mb-4" title="This class was cancelled">
          {register.cancelledReason ?? 'No reason was recorded.'} It does not count towards
          anyone&rsquo;s attendance.
        </Alert>
      ) : null}

      {register.entries.length === 0 ? (
        <EmptyState
          title="No students on this register"
          description="No active students are enrolled in this section."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="space-y-3 border-b border-border p-3">
            <div className="relative">
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
                <Button variant="secondary" size="sm" onClick={markAllPresent}>
                  <Check className="h-4 w-4" aria-hidden />
                  Mark all present
                </Button>
                <span className="flex items-center gap-1 text-xs text-foreground-muted">
                  <Keyboard className="h-3.5 w-3.5" aria-hidden />
                  With a row focused: P, A, L, E
                </span>
              </div>
            ) : null}
          </div>

          <ul className="divide-y divide-border">
            {visible.map((entry, index) => (
              <li
                key={entry.id}
                tabIndex={editable ? 0 : -1}
                onKeyDown={
                  editable
                    ? (event) => {
                        const status = SHORTCUTS[event.key.toLowerCase()]
                        if (!status) return
                        event.preventDefault()
                        setStatus(entry.studentId, status)
                      }
                    : undefined
                }
                className="flex flex-col gap-2 p-3 focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="w-8 shrink-0 tabular-nums text-sm text-foreground-muted">
                    {entry.rollNumber ?? index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.fullName}</p>
                    <p className="text-xs text-foreground-muted">{entry.studentCode}</p>
                  </div>
                </div>

                <div className="shrink-0 pl-11 sm:pl-0">
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
                </div>
              </li>
            ))}
          </ul>

          {visible.length === 0 ? (
            <EmptyState title={`No students match “${search}”`} description="Try a different search." />
          ) : null}
        </Card>
      )}

      {/* A sticky bar, so Save and Submit are always in reach on a phone. */}
      {editable && register.entries.length > 0 ? (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-lg">
          <p className="text-sm text-foreground-muted" aria-live="polite">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved' && !dirty
                ? 'Saved'
                : saveState === 'failed'
                  ? 'Unable to save'
                  : dirty
                    ? 'Unsaved changes'
                    : 'No changes'}
          </p>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={save}
              loading={saveState === 'saving'}
              disabled={!dirty}
            >
              <Save className="h-4 w-4" aria-hidden />
              Save draft
            </Button>
            <Button onClick={() => setSubmitOpen(true)}>
              <Send className="h-4 w-4" aria-hidden />
              Submit
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent
          title="Submit this attendance?"
          description="Once submitted you will not be able to change it — the office can."
        >
          <dl className="space-y-1 rounded-[var(--radius-control)] border border-border p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Total students</dt>
              <dd className="font-medium tabular-nums">{register.studentCount}</dd>
            </div>
            {STATUS_ORDER.map((status) => {
              const value =
                status === 'PRESENT'
                  ? counts.present
                  : status === 'ABSENT'
                    ? counts.absent
                    : status === 'LATE'
                      ? counts.late
                      : counts.leave
              return (
                <div key={status} className="flex justify-between">
                  <dt className="text-foreground-muted">{ATTENDANCE_STATUS_LABEL[status]}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              )
            })}
          </dl>

          {unreviewed > 0 ? (
            <Alert variant="warning" className="mt-3">
              {unreviewed} student{unreviewed === 1 ? ' still has' : 's still have'} the default
              mark of Present. Check {unreviewed === 1 ? 'them' : 'they were all there'} before
              submitting.
            </Alert>
          ) : (
            <Alert variant="success" className="mt-3">
              Ready to submit — every student has been checked.
            </Alert>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>
              Keep marking
            </Button>
            <Button onClick={submit} loading={submitting}>
              Submit attendance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

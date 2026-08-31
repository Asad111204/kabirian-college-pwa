'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { PERIOD_MAX, PERIOD_MIN } from '@/server/attendance/attendance-policy'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'

export interface StaffOption {
  id: string
  fullName: string
  staffCode: string
}

interface CurriculumSubject {
  subjectId: string
  subjectName: string
}

/**
 * Opening a register.
 *
 * The dropdowns narrow the same way the enrolment form's do, from one list read
 * out of the database — so a program or section added five minutes ago is
 * already here, and nothing about the college's structure is written into this
 * file.
 *
 * The subject list is fetched per section from the curriculum, because a
 * section's subjects come from its class and program. The server checks it
 * again; this only stops an administrator picking something that would be
 * refused.
 */
export function CreateSheetDialog({
  open,
  onOpenChange,
  sessions,
  groupsBySession,
  staff,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessions: { id: string; name: string; isCurrent: boolean }[]
  groupsBySession: Record<string, EnrollmentOptionGroup[]>
  staff: StaffOption[]
  today: string
}) {
  const router = useRouter()

  const defaultSession = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? ''
  const [sessionId, setSessionId] = React.useState(defaultSession)
  const [classId, setClassId] = React.useState('')
  const [divisionId, setDivisionId] = React.useState('')
  const [programId, setProgramId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [kind, setKind] = React.useState<'daily' | 'subject'>('subject')
  const [subjectId, setSubjectId] = React.useState('')
  const [date, setDate] = React.useState(today)
  const [period, setPeriod] = React.useState('1')
  const [markedByStaffId, setMarkedByStaffId] = React.useState('')

  const [loadedSubjects, setLoadedSubjects] = React.useState<{
    key: string
    rows: CurriculumSubject[]
  } | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  // Memoised so the dropdown lists below do not rebuild on every keystroke.
  const groups = React.useMemo(
    () => groupsBySession[sessionId] ?? [],
    [groupsBySession, sessionId],
  )

  const classes = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) seen.set(g.classId, g.className)
    return [...seen.entries()]
  }, [groups])

  const divisions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      seen.set(g.divisionId, g.divisionName)
    }
    return [...seen.entries()]
  }, [groups, classId])

  const programs = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      if (divisionId && g.divisionId !== divisionId) continue
      seen.set(g.programId, g.programName)
    }
    return [...seen.entries()]
  }, [groups, classId, divisionId])

  const sections = React.useMemo(() => {
    const list: { id: string; label: string; studentCount: number }[] = []
    for (const g of groups) {
      if (classId && g.classId !== classId) continue
      if (divisionId && g.divisionId !== divisionId) continue
      if (programId && g.programId !== programId) continue
      for (const s of g.sections) {
        list.push({ id: s.id, label: `Section ${s.name}`, studentCount: s.studentCount })
      }
    }
    return list
  }, [groups, classId, divisionId, programId])

  const chosenSection = sections.find((s) => s.id === sectionId) ?? null
  const canChooseSubject = Boolean(classId && programId && sessionId)

  /**
   * The curriculum for whichever class and program are currently chosen.
   *
   * `subjectKey` is null whenever a subject is not being chosen, and the loaded
   * rows are stamped with the key they belong to. That means both "which
   * subjects" and "are we still loading" are *derived* from state rather than
   * assigned inside an effect, which is what keeps a stale list from flashing up
   * against the wrong class.
   */
  const subjectKey =
    kind === 'subject' && canChooseSubject ? `${sessionId}|${classId}|${programId}` : null
  const subjects = loadedSubjects && loadedSubjects.key === subjectKey ? loadedSubjects.rows : null
  const loadingSubjects = subjectKey !== null && subjects === null

  React.useEffect(() => {
    if (!subjectKey) return
    const [sid, cid, pid] = subjectKey.split('|')

    let cancelled = false
    api
      .get<CurriculumSubject[]>(
        `/api/v1/academics/curriculum?sessionId=${sid}&classId=${cid}&programId=${pid}`,
      )
      .then((rows) => {
        if (!cancelled) setLoadedSubjects({ key: subjectKey, rows })
      })
      .catch(() => {
        // A failed lookup shows the "no subjects" state rather than a blank box.
        if (!cancelled) setLoadedSubjects({ key: subjectKey, rows: [] })
      })

    return () => {
      cancelled = true
    }
  }, [subjectKey])

  function reset() {
    setClassId('')
    setDivisionId('')
    setProgramId('')
    setSectionId('')
    setSubjectId('')
    setKind('subject')
    setDate(today)
    setPeriod('1')
    setMarkedByStaffId('')
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!sectionId) return setFormError('Choose a section.')
    if (kind === 'subject' && !subjectId) return setFormError('Choose a subject.')
    if (!markedByStaffId) return setFormError('Choose who took this attendance.')

    setSubmitting(true)
    try {
      const sheet = await api.post<{ id: string }>('/api/v1/attendance/sheets', {
        sectionId,
        subjectId: kind === 'subject' ? subjectId : null,
        date,
        period: Number(period),
        markedByStaffId,
      })
      toast.success('Register opened. Mark the students, then submit.')
      onOpenChange(false)
      reset()
      router.push(`/admin/attendance/${sheet.id}`)
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'The register could not be opened.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent
        title="Open an attendance register"
        description="Choose the class and who took it. The student list is built on the server from the section's active enrolments."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Academic session" htmlFor="session" required>
              <Select
                id="session"
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value)
                  setClassId('')
                  setDivisionId('')
                  setProgramId('')
                  setSectionId('')
                  setSubjectId('')
                }}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Class / Year" htmlFor="class" required>
              <Select
                id="class"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value)
                  setDivisionId('')
                  setProgramId('')
                  setSectionId('')
                  setSubjectId('')
                }}
              >
                <option value="">Choose…</option>
                {classes.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Division" htmlFor="division" required>
              <Select
                id="division"
                value={divisionId}
                disabled={!classId}
                onChange={(e) => {
                  setDivisionId(e.target.value)
                  setProgramId('')
                  setSectionId('')
                }}
              >
                <option value="">Choose…</option>
                {divisions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Program" htmlFor="program" required>
              <Select
                id="program"
                value={programId}
                disabled={!divisionId}
                onChange={(e) => {
                  setProgramId(e.target.value)
                  setSectionId('')
                  setSubjectId('')
                }}
              >
                <option value="">Choose…</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Section"
              htmlFor="section"
              required
              hint={chosenSection ? `${chosenSection.studentCount} students enrolled` : undefined}
            >
              <Select
                id="section"
                value={sectionId}
                disabled={!programId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">Choose…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Attendance type" htmlFor="kind" required>
              <Select
                id="kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as 'daily' | 'subject')
                  setSubjectId('')
                }}
              >
                <option value="subject">Subject attendance</option>
                <option value="daily">Daily roll call</option>
              </Select>
            </Field>
          </div>

          {kind === 'subject' ? (
            <Field
              label="Subject"
              htmlFor="subject"
              required
              hint="Only subjects in this class and program's curriculum."
            >
              {!canChooseSubject ? (
                <p className="text-sm text-foreground-muted">
                  Choose a class and program first.
                </p>
              ) : loadingSubjects ? (
                <p className="text-sm text-foreground-muted">Loading subjects…</p>
              ) : subjects && subjects.length === 0 ? (
                <Alert variant="warning" title="No subjects in this curriculum">
                  No subjects have been assigned to this class and program yet.{' '}
                  <Link href="/admin/academics/curriculum">Set the curriculum</Link>, or take a
                  daily roll call instead.
                </Alert>
              ) : (
                <Select
                  id="subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {(subjects ?? []).map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.subjectName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Alert variant="info">
              A daily roll call covers the whole section for the day, rather than one subject.
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="date" required hint="Today, or an earlier date.">
              <Input
                id="date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field label="Period" htmlFor="period" required hint={`${PERIOD_MIN}–${PERIOD_MAX}`}>
              <Input
                id="period"
                type="number"
                min={PERIOD_MIN}
                max={PERIOD_MAX}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Attendance taken by"
            htmlFor="markedBy"
            required
            hint="The teacher who actually took this register — not necessarily you."
          >
            {staff.length === 0 ? (
              <Alert variant="warning" title="No staff records yet">
                Add a staff member before recording attendance.{' '}
                <Link href="/admin/staff">Go to Staff</Link>
              </Alert>
            ) : (
              <Select
                id="markedBy"
                value={markedByStaffId}
                onChange={(e) => setMarkedByStaffId(e.target.value)}
              >
                <option value="">Choose…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.staffCode})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Open register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

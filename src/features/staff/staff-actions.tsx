'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Link2, Link2Off, Power, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABEL } from '@/validation/staff'
import { TemporaryPasswordPanel } from '@/features/users/shared'
import type { AssignmentOptionGroup } from '@/server/services/staff.service'

type DialogKind = 'assign' | 'incharge' | 'status' | 'account' | 'unlink' | null

interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}

export function StaffActions({
  staff,
  sessions,
}: {
  staff: {
    id: string
    fullName: string
    staffCode: string
    staffType: string
    employmentStatus: string
    hasAccount: boolean
    accountUsername: string | null
  }
  sessions: SessionOption[]
}) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<DialogKind>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const isActive = staff.employmentStatus === 'ACTIVE'
  const isTeaching = staff.staffType === 'TEACHING'

  function close() {
    setDialog(null)
    setError(null)
    setFieldErrors({})
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await action()
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.fields) setFieldErrors(err.fields)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ActionRow
            icon={BookOpen}
            title="Assign a subject"
            description={
              !isTeaching
                ? 'Only teaching staff can be assigned subjects.'
                : !isActive
                  ? 'Only active staff can receive new assignments.'
                  : 'Teach a subject in one section.'
            }
            disabled={!isTeaching || !isActive}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!isTeaching || !isActive}
                onClick={() => setDialog('assign')}
              >
                Assign
              </Button>
            }
          />

          <ActionRow
            icon={ShieldCheck}
            title="Make section in-charge"
            description={
              isActive
                ? 'Responsible for a whole section, not just one subject.'
                : 'Only active staff can be made in-charge.'
            }
            disabled={!isActive}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!isActive}
                onClick={() => setDialog('incharge')}
              >
                Assign
              </Button>
            }
          />

          <ActionRow
            icon={Power}
            title="Change employment status"
            description={`Currently ${EMPLOYMENT_STATUS_LABEL[staff.employmentStatus] ?? staff.employmentStatus}.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setDialog('status')}>
                Change
              </Button>
            }
          />

          {staff.hasAccount ? (
            <ActionRow
              icon={Link2Off}
              title="Portal account"
              description={`Linked to ${staff.accountUsername}.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setDialog('unlink')}>
                  Unlink
                </Button>
              }
            />
          ) : (
            <ActionRow
              icon={Link2}
              title="Portal account"
              description="No login yet. Create one so they can sign in."
              action={
                <Button variant="secondary" size="sm" onClick={() => setDialog('account')}>
                  Add account
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {dialog === 'assign' || dialog === 'incharge' ? (
        <PlacementDialog
          kind={dialog}
          staffName={staff.fullName}
          sessions={sessions}
          busy={busy}
          error={error}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(payload) =>
            run(async () => {
              if (dialog === 'assign') {
                await api.post(`/api/v1/staff/${staff.id}/assignments`, payload)
                toast.success('Subject assigned.')
              } else {
                await api.post(`/api/v1/staff/${staff.id}/incharge`, payload)
                toast.success('Section in-charge assigned.')
              }
              close()
            })
          }
        />
      ) : null}

      {dialog === 'status' ? (
        <StatusDialog
          staff={staff}
          busy={busy}
          error={error}
          onClose={close}
          onSubmit={(status, leavingDate, reason) =>
            run(async () => {
              await api.patch(`/api/v1/staff/${staff.id}/status`, {
                employmentStatus: status,
                leavingDate: leavingDate || undefined,
                reason: reason || undefined,
              })
              toast.success('Employment status updated.')
              close()
            })
          }
        />
      ) : null}

      {dialog === 'account' ? (
        <AccountDialog staffId={staff.id} staffName={staff.fullName} onClose={close} />
      ) : null}

      {dialog === 'unlink' ? (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent
            title="Unlink the portal account?"
            description={`${staff.fullName} · ${staff.accountUsername}`}
          >
            {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
            <Alert variant="info">
              The login itself is kept — only the connection to this staff record is removed. Their
              scoped access to students ends, because that comes from this link.
            </Alert>
            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                loading={busy}
                onClick={() =>
                  run(async () => {
                    await api.delete(`/api/v1/staff/${staff.id}/account`)
                    toast.success('Account unlinked.')
                    close()
                  })
                }
              >
                Unlink account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Assignment / in-charge share one cascading dialog                          */
/* -------------------------------------------------------------------------- */

interface PlacementPayload {
  academicSessionId: string
  classId: string
  divisionId: string
  programId: string
  sectionId: string
  subjectId?: string
}

function PlacementDialog({
  kind,
  staffName,
  sessions,
  busy,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  kind: 'assign' | 'incharge'
  staffName: string
  sessions: SessionOption[]
  busy: boolean
  error: string | null
  fieldErrors: Record<string, string[]>
  onClose: () => void
  onSubmit: (payload: PlacementPayload) => void
}) {
  const needsSubject = kind === 'assign'

  const [sessionId, setSessionId] = React.useState(
    sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? '',
  )
  const [classId, setClassId] = React.useState('')
  const [divisionId, setDivisionId] = React.useState('')
  const [programId, setProgramId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')

  const [loaded, setLoaded] = React.useState<{ sessionId: string; groups: AssignmentOptionGroup[] } | null>(null)

  React.useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    fetch(`/api/v1/staff/assignment-options?sessionId=${sessionId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((payload: { data: AssignmentOptionGroup[] }) => {
        if (!cancelled) setLoaded({ sessionId, groups: payload.data })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ sessionId, groups: [] })
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const isCurrent = loaded?.sessionId === sessionId
  // Memoised so the fallback is not a fresh array on every render, which would
  // invalidate the derived lists below each time.
  const groups = React.useMemo<AssignmentOptionGroup[]>(
    () => (isCurrent && loaded ? loaded.groups : []),
    [isCurrent, loaded],
  )
  const loading = Boolean(sessionId) && !isCurrent

  const classes = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) seen.set(g.classId, g.className)
    return [...seen.entries()]
  }, [groups])

  const divisions = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) if (g.classId === classId) seen.set(g.divisionId, g.divisionName)
    return [...seen.entries()]
  }, [groups, classId])

  const programs = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) {
      if (g.classId === classId && g.divisionId === divisionId) seen.set(g.programId, g.programName)
    }
    return [...seen.entries()]
  }, [groups, classId, divisionId])

  const group = React.useMemo(
    () => groups.find((g) => g.classId === classId && g.divisionId === divisionId && g.programId === programId),
    [groups, classId, divisionId, programId],
  )

  const sections = group?.sections ?? []
  const subjects = group?.subjects ?? []

  const ready = Boolean(sectionId) && (!needsSubject || Boolean(subjectId))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={needsSubject ? 'Assign a subject' : 'Make section in-charge'}
        description={staffName}
        className="sm:max-w-2xl"
      >
        <div className="space-y-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Academic session" htmlFor="sessionId" required>
              <Select
                id="sessionId"
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value)
                  setClassId('')
                  setDivisionId('')
                  setProgramId('')
                  setSectionId('')
                  setSubjectId('')
                }}
                disabled={busy}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Class / Year"
              htmlFor="classId"
              required
              hint={loading ? 'Loading the structure…' : undefined}
              error={fieldErrors.classId}
            >
              <Select
                id="classId"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value)
                  setDivisionId('')
                  setProgramId('')
                  setSectionId('')
                  setSubjectId('')
                }}
                disabled={busy || loading || classes.length === 0}
              >
                <option value="">Select a class…</option>
                {classes.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Division" htmlFor="divisionId" required error={fieldErrors.divisionId}>
              <Select
                id="divisionId"
                value={divisionId}
                onChange={(e) => {
                  setDivisionId(e.target.value)
                  setProgramId('')
                  setSectionId('')
                  setSubjectId('')
                }}
                disabled={busy || !classId}
              >
                <option value="">{classId ? 'Select a division…' : 'Choose a class first'}</option>
                {divisions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Program / Group" htmlFor="programId" required error={fieldErrors.programId}>
              <Select
                id="programId"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value)
                  setSectionId('')
                  setSubjectId('')
                }}
                disabled={busy || !divisionId}
              >
                <option value="">{divisionId ? 'Select a program…' : 'Choose a division first'}</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Section" htmlFor="sectionId" required error={fieldErrors.sectionId}>
              <Select
                id="sectionId"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={busy || !programId}
              >
                <option value="">{programId ? 'Select a section…' : 'Choose a program first'}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.name}
                    {s.inchargeName ? ` — in-charge: ${s.inchargeName}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            {needsSubject ? (
              <Field
                label="Subject"
                htmlFor="subjectId"
                required
                hint="Only subjects in this program's curriculum."
                error={fieldErrors.subjectId}
              >
                <Select
                  id="subjectId"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  disabled={busy || !sectionId}
                >
                  <option value="">{sectionId ? 'Select a subject…' : 'Choose a section first'}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          {needsSubject && sectionId && subjects.length === 0 ? (
            <Alert variant="warning" title="No subjects in this curriculum">
              This class and program has no subjects set yet, so there is nothing to assign. Set the
              curriculum first in Academic Management.
            </Alert>
          ) : null}

          {!needsSubject && group && sectionId ? (
            <Alert variant="info">
              {sections.find((s) => s.id === sectionId)?.inchargeName
                ? `This section already has an in-charge. Assigning ${staffName} will replace them, and the previous appointment stays on record.`
                : 'This section has no in-charge yet.'}
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!ready}
            onClick={() =>
              onSubmit({
                academicSessionId: sessionId,
                classId,
                divisionId,
                programId,
                sectionId,
                ...(needsSubject ? { subjectId } : {}),
              })
            }
          >
            {needsSubject ? 'Assign subject' : 'Make in-charge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function StatusDialog({
  staff,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  staff: { employmentStatus: string; fullName: string }
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (status: string, leavingDate: string, reason: string) => void
}) {
  const [status, setStatus] = React.useState(staff.employmentStatus)
  const [leavingDate, setLeavingDate] = React.useState('')
  const [reason, setReason] = React.useState('')

  const endsEmployment = status !== 'ACTIVE' && status !== 'ON_LEAVE'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Change employment status" description={staff.fullName}>
        <div className="space-y-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}

          <Field label="Status" htmlFor="employmentStatus" required>
            <Select
              id="employmentStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
            >
              {EMPLOYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EMPLOYMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          {endsEmployment ? (
            <Field label="Last working day" htmlFor="leavingDate" hint="Defaults to today.">
              <Input
                id="leavingDate"
                type="date"
                value={leavingDate}
                onChange={(e) => setLeavingDate(e.target.value)}
                disabled={busy}
              />
            </Field>
          ) : null}

          <Field label="Reason" htmlFor="statusReason" hint="Optional. Recorded in the audit log.">
            <Textarea
              id="statusReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </Field>

          {endsEmployment ? (
            <Alert variant="warning">
              Their teaching assignments and section in-charge roles will be closed, which also ends
              their access to student information. Every record is kept as history.
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={status === staff.employmentStatus}
            onClick={() => onSubmit(status, leavingDate, reason)}
          >
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function AccountDialog({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string
  staffName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [username, setUsername] = React.useState(
    staffName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.'),
  )
  const [created, setCreated] = React.useState<{ username: string; temporaryPassword: string } | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  async function create() {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const result = await api.post<{ account?: { username: string; temporaryPassword: string } }>(
        `/api/v1/staff/${staffId}/account`,
        { username },
      )
      if (result.account) setCreated(result.account)
      toast.success('Staff portal account created and linked.')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.fields) setFieldErrors(err.fields)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={created ? 'Account created' : 'Create a staff portal account'}
        description={created ? undefined : staffName}
      >
        {created ? (
          <>
            <TemporaryPasswordPanel
              username={created.username}
              password={created.temporaryPassword}
              context="created"
            />
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              {error ? <Alert variant="danger">{error}</Alert> : null}

              <Field
                label="Username"
                htmlFor="accountUsername"
                required
                hint="A temporary password is generated and shown once."
                error={fieldErrors.username}
              >
                <Input
                  id="accountUsername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className="font-mono"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={submitting}
                />
              </Field>

              <Alert variant="info">
                This creates an ordinary staff account using the same system as User Accounts, and
                links it to this staff record. Their access to students comes from their
                assignments, not from the account itself.
              </Alert>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button loading={submitting} disabled={username.trim().length < 3} onClick={create}>
                Create account
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

/** Closes one assignment or in-charge role from the profile lists. */
export function CloseAssignmentButton({
  staffId,
  id,
  kind,
  label,
}: {
  staffId: string
  id: string
  kind: 'assignment' | 'incharge'
  label: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function close() {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'assignment') {
        await api.delete(`/api/v1/staff/${staffId}/assignments/${id}`)
        toast.success('Assignment closed. It stays in the history.')
      } else {
        await api.delete(`/api/v1/staff/${staffId}/incharge/${id}`)
        toast.success('In-charge role ended. It stays in the history.')
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger-600 hover:bg-danger-50"
        onClick={() => setOpen(true)}
        aria-label={`End ${label}`}
      >
        <X className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={kind === 'assignment' ? 'End this assignment?' : 'End this in-charge role?'}
          description={label}
        >
          {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
          <Alert variant="info">
            The record is kept and marked as ended, so anything already recorded under it stays
            attributable. The teacher loses access to this section&apos;s students.
          </Alert>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={close}>
              End it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function ActionRow({
  icon: Icon,
  title,
  description,
  action,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action: React.ReactNode
  disabled?: boolean
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border p-3 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-foreground-muted">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

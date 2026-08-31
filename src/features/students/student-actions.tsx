'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, GraduationCap, Link2, Link2Off, Power } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { STUDENT_STATUS_LABEL, STUDENT_STATUSES } from '@/validation/students'
import { TemporaryPasswordPanel } from '@/features/users/shared'
import {
  EMPTY_ENROLLMENT,
  EnrollmentPicker,
  useEnrollmentOptions,
  type EnrollmentValue,
  type SessionOption,
} from './enrollment-picker'

type DialogKind = 'transfer' | 'promote' | 'status' | 'account' | 'unlink' | null

export function StudentActions({
  student,
  sessions,
}: {
  student: {
    id: string
    fullName: string
    studentCode: string
    status: string
    hasAccount: boolean
    accountUsername: string | null
    currentSessionId: string | null
    currentPlacementLabel: string | null
  }
  sessions: SessionOption[]
}) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<DialogKind>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

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
            icon={ArrowRightLeft}
            title="Transfer"
            description="Move to another section, program or division in the same session."
            disabled={!student.currentSessionId}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!student.currentSessionId}
                onClick={() => setDialog('transfer')}
              >
                Transfer
              </Button>
            }
          />

          <ActionRow
            icon={GraduationCap}
            title="Promote"
            description="Move into a later academic session — the new academic year."
            disabled={!student.currentSessionId || student.status !== 'ACTIVE'}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!student.currentSessionId || student.status !== 'ACTIVE'}
                onClick={() => setDialog('promote')}
              >
                Promote
              </Button>
            }
          />

          <ActionRow
            icon={Power}
            title="Change status"
            description={`Currently ${STUDENT_STATUS_LABEL[student.status as keyof typeof STUDENT_STATUS_LABEL] ?? student.status}.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setDialog('status')}>
                Change
              </Button>
            }
          />

          {student.hasAccount ? (
            <ActionRow
              icon={Link2Off}
              title="Portal account"
              description={`Linked to ${student.accountUsername}.`}
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
              description="No login yet. Create one so the student can sign in."
              action={
                <Button variant="secondary" size="sm" onClick={() => setDialog('account')}>
                  Add account
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {dialog === 'transfer' ? (
        <MoveDialog
          kind="transfer"
          student={student}
          sessions={sessions}
          busy={busy}
          error={error}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(enrollment, extra) =>
            run(async () => {
              await api.post(`/api/v1/students/${student.id}/transfer`, {
                enrollment,
                reason: extra.reason || undefined,
              })
              toast.success('Student transferred. The previous placement is kept in their history.')
              close()
            })
          }
        />
      ) : null}

      {dialog === 'promote' ? (
        <MoveDialog
          kind="promote"
          student={student}
          sessions={sessions}
          busy={busy}
          error={error}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(enrollment, extra) =>
            run(async () => {
              await api.post(`/api/v1/students/${student.id}/promote`, {
                enrollment,
                outcome: extra.outcome,
                reason: extra.reason || undefined,
              })
              toast.success('Student promoted. Last year’s record is kept.')
              close()
            })
          }
        />
      ) : null}

      {dialog === 'status' ? (
        <StatusDialog
          student={student}
          busy={busy}
          error={error}
          onClose={close}
          onSubmit={(status, reason) =>
            run(async () => {
              await api.patch(`/api/v1/students/${student.id}/status`, { status, reason: reason || undefined })
              toast.success('Status updated.')
              close()
            })
          }
        />
      ) : null}

      {dialog === 'account' ? (
        <AccountDialog
          student={student}
          busy={busy}
          error={error}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(usernameValue) =>
            run(async () => {
              const result = await api.post<{ account?: { username: string; temporaryPassword: string } }>(
                `/api/v1/students/${student.id}/account`,
                { username: usernameValue },
              )
              if (result.account) {
                // Handled by the dialog: it shows the password before closing.
                throw Object.assign(new Error('created'), { created: result.account })
              }
            })
          }
        />
      ) : null}

      {dialog === 'unlink' ? (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent
            title="Unlink the portal account?"
            description={`${student.fullName} · ${student.accountUsername}`}
          >
            {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
            <Alert variant="info">
              The login itself is kept — only the connection to this student record is removed. To
              stop the person signing in, deactivate the account in User Accounts instead.
            </Alert>
            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                loading={busy}
                onClick={() =>
                  run(async () => {
                    await api.delete(`/api/v1/students/${student.id}/account`)
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
/* Transfer / promote share one dialog                                        */
/* -------------------------------------------------------------------------- */

function MoveDialog({
  kind,
  student,
  sessions,
  busy,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  kind: 'transfer' | 'promote'
  student: { currentSessionId: string | null; currentPlacementLabel: string | null; fullName: string }
  sessions: SessionOption[]
  busy: boolean
  error: string | null
  fieldErrors: Record<string, string[]>
  onClose: () => void
  onSubmit: (enrollment: EnrollmentValue, extra: { reason: string; outcome: string }) => void
}) {
  const isTransfer = kind === 'transfer'

  // A transfer stays in the current session; a promotion moves to a later one.
  const laterSessions = sessions.filter((s) => s.id !== student.currentSessionId)
  const [enrollment, setEnrollment] = React.useState<EnrollmentValue>({
    ...EMPTY_ENROLLMENT,
    academicSessionId: isTransfer ? (student.currentSessionId ?? '') : (laterSessions[0]?.id ?? ''),
  })
  const [reason, setReason] = React.useState('')
  const [outcome, setOutcome] = React.useState('PROMOTED')

  const { groups, loading } = useEnrollmentOptions(enrollment.academicSessionId)

  const ready = Boolean(enrollment.sectionId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={isTransfer ? 'Transfer student' : 'Promote student'}
        description={
          isTransfer
            ? 'Move within the same academic session. The current placement is kept in their history.'
            : 'Move into a later academic session. This year’s record is closed but kept.'
        }
        className="sm:max-w-2xl"
      >
        <div className="space-y-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}

          {student.currentPlacementLabel ? (
            <div className="rounded-[var(--radius-control)] border border-border bg-surface-muted p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Currently
              </p>
              <p className="mt-0.5 font-medium">{student.currentPlacementLabel}</p>
            </div>
          ) : null}

          {!isTransfer && laterSessions.length === 0 ? (
            <Alert variant="warning" title="No other academic session">
              Create the next academic session and its structure before promoting students.
            </Alert>
          ) : (
            <>
              {!isTransfer ? (
                <Field label="How did this year end?" htmlFor="outcome" required>
                  <Select
                    id="outcome"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    disabled={busy}
                  >
                    <option value="PROMOTED">Promoted — moving up to the next class</option>
                    <option value="REPEATED">Repeated — staying in the same class</option>
                    <option value="COMPLETED">Completed — finished their final year</option>
                  </Select>
                </Field>
              ) : null}

              <EnrollmentPicker
                sessions={isTransfer ? sessions.filter((s) => s.id === student.currentSessionId) : laterSessions}
                groups={groups}
                value={enrollment}
                onChange={setEnrollment}
                loading={loading}
                disabled={busy}
                errors={fieldErrors}
                lockSession={isTransfer}
              />

              <Field label="Reason" htmlFor="reason" hint="Optional. Recorded in the audit log.">
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isTransfer ? 'e.g. Changed from Pre-Engineering to ICS Physics' : ''}
                  disabled={busy}
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!ready}
            onClick={() => onSubmit(enrollment, { reason, outcome })}
          >
            {isTransfer ? 'Transfer student' : 'Promote student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function StatusDialog({
  student,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  student: { status: string; fullName: string }
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (status: string, reason: string) => void
}) {
  const [status, setStatus] = React.useState(student.status)
  const [reason, setReason] = React.useState('')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Change student status" description={student.fullName}>
        <div className="space-y-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}

          <Field label="Status" htmlFor="status" required>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
              {STUDENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STUDENT_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason" htmlFor="statusReason" hint="Optional. Recorded in the audit log.">
            <Textarea
              id="statusReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </Field>

          {status !== 'ACTIVE' ? (
            <Alert variant="warning">
              Their current enrollment will be closed and their roll number released. Nothing is
              deleted — every past record stays exactly as it is.
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={status === student.status} onClick={() => onSubmit(status, reason)}>
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function AccountDialog({
  student,
  busy,
  error,
  fieldErrors,
  onClose,
}: {
  student: { id: string; fullName: string }
  busy: boolean
  error: string | null
  fieldErrors: Record<string, string[]>
  onClose: () => void
  onSubmit: (username: string) => void
}) {
  const router = useRouter()
  const [username, setUsername] = React.useState(
    student.fullName
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
  const [localError, setLocalError] = React.useState<string | null>(null)
  const [localFieldErrors, setLocalFieldErrors] = React.useState<Record<string, string[]>>({})

  async function create() {
    setSubmitting(true)
    setLocalError(null)
    setLocalFieldErrors({})
    try {
      const result = await api.post<{ account?: { username: string; temporaryPassword: string } }>(
        `/api/v1/students/${student.id}/account`,
        { username },
      )
      if (result.account) setCreated(result.account)
      toast.success('Portal account created and linked.')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setLocalError(err.message)
        if (err.fields) setLocalFieldErrors(err.fields)
      } else {
        setLocalError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={created ? 'Account created' : 'Create a portal account'}
        description={created ? undefined : student.fullName}
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
              {(localError ?? error) ? <Alert variant="danger">{localError ?? error}</Alert> : null}

              <Field
                label="Username"
                htmlFor="accountUsername"
                required
                hint="A temporary password is generated and shown once."
                error={localFieldErrors.username ?? fieldErrors.username}
              >
                <Input
                  id="accountUsername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className="font-mono"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={submitting || busy}
                />
              </Field>

              <Alert variant="info">
                This creates an ordinary student account using the same system as User Accounts, and
                links it to this student record.
              </Alert>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={submitting || busy}>
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

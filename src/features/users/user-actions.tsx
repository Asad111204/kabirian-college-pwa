'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, LogOut, Pencil, Power, ShieldCheck, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { userUpdateSchema } from '@/validation/users'
import { DangerNote, ROLE_LABEL, TemporaryPasswordPanel } from './shared'
import type { UserRole, UserStatus } from '@/generated/prisma/enums'

export interface UserActionsProps {
  user: {
    id: string
    username: string
    displayName: string
    fullNameValue: string
    email: string | null
    role: UserRole
    status: UserStatus
    isLocked: boolean
    isSystemOwner: boolean
    activeSessionCount: number
    hasProfile: boolean
  }
  /** True when the signed-in administrator is looking at their own account. */
  isSelf: boolean
  /** Used to explain, in the UI, why some actions are unavailable. */
  activeAdminCount: number
  canManagePermissions: boolean
}

type DialogKind = 'edit' | 'status' | 'role' | 'reset' | 'sessions' | null

export function UserActions({ user, isSelf, activeAdminCount }: UserActionsProps) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<DialogKind>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [newPassword, setNewPassword] = React.useState<string | null>(null)

  const [editForm, setEditForm] = React.useState({
    fullName: user.fullNameValue,
    username: user.username,
    email: user.email ?? '',
  })
  const [nextRole, setNextRole] = React.useState<UserRole>(user.role)
  const [confirmText, setConfirmText] = React.useState('')

  const isLastActiveAdmin = user.role === 'ADMIN' && user.status === 'ACTIVE' && activeAdminCount <= 1

  // Reasons an action is blocked, shown in the UI as well as enforced server-side.
  const deactivateBlockedReason = isSelf
    ? 'You cannot deactivate your own account.'
    : user.isSystemOwner
      ? 'The system owner account cannot be deactivated.'
      : isLastActiveAdmin
        ? 'This is the only active administrator.'
        : null

  const roleBlockedReason = isSelf
    ? 'You cannot change your own role.'
    : user.isSystemOwner
      ? 'The system owner account keeps the administrator role.'
      : isLastActiveAdmin
        ? 'This is the only active administrator.'
        : null

  function close() {
    setDialog(null)
    setError(null)
    setFieldErrors({})
    setConfirmText('')
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
          <CardTitle>Account actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ActionRow
            icon={Pencil}
            title="Edit details"
            description="Change the name, username or email address."
            action={
              <Button variant="secondary" size="sm" onClick={() => setDialog('edit')}>
                Edit
              </Button>
            }
          />

          <ActionRow
            icon={KeyRound}
            title="Reset password"
            description="Issues a new temporary password and signs the person out everywhere."
            action={
              <Button variant="secondary" size="sm" onClick={() => setDialog('reset')}>
                Reset
              </Button>
            }
          />

          <ActionRow
            icon={ShieldCheck}
            title="Change role"
            description={roleBlockedReason ?? `Currently ${ROLE_LABEL[user.role]}.`}
            disabled={Boolean(roleBlockedReason)}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={Boolean(roleBlockedReason)}
                onClick={() => {
                  setNextRole(user.role)
                  setDialog('role')
                }}
              >
                Change
              </Button>
            }
          />

          <ActionRow
            icon={Power}
            title={user.status === 'ACTIVE' ? 'Deactivate account' : 'Activate account'}
            description={
              user.status === 'ACTIVE'
                ? (deactivateBlockedReason ?? 'Blocks sign-in immediately and keeps all records.')
                : 'Allows this person to sign in again.'
            }
            disabled={user.status === 'ACTIVE' && Boolean(deactivateBlockedReason)}
            action={
              <Button
                variant={user.status === 'ACTIVE' ? 'danger' : 'primary'}
                size="sm"
                disabled={user.status === 'ACTIVE' && Boolean(deactivateBlockedReason)}
                onClick={() =>
                  user.status === 'ACTIVE'
                    ? setDialog('status')
                    : run(async () => {
                        await api.patch(`/api/v1/users/${user.id}/status`, { status: 'ACTIVE' })
                        toast.success('Account activated.')
                      })
                }
                loading={busy && dialog === null}
              >
                {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
            }
          />

          {user.isLocked ? (
            <ActionRow
              icon={Unlock}
              title="Unlock account"
              description="Temporarily locked after too many wrong passwords."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    run(async () => {
                      await api.post(`/api/v1/users/${user.id}/unlock`)
                      toast.success('Account unlocked.')
                    })
                  }
                >
                  Unlock
                </Button>
              }
            />
          ) : null}

          <ActionRow
            icon={LogOut}
            title="Sign out everywhere"
            description={
              user.activeSessionCount === 0
                ? 'No active sessions.'
                : `${user.activeSessionCount} active session${user.activeSessionCount === 1 ? '' : 's'}.`
            }
            disabled={user.activeSessionCount === 0}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={user.activeSessionCount === 0}
                onClick={() => setDialog('sessions')}
              >
                Sign out
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* ---------------- Edit ---------------- */}
      <Dialog open={dialog === 'edit'} onOpenChange={(open) => !open && close()}>
        <DialogContent title="Edit account details">
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              const parsed = userUpdateSchema.safeParse(editForm)
              if (!parsed.success) {
                const errors: Record<string, string[]> = {}
                for (const issue of parsed.error.issues) {
                  const key = String(issue.path[0] ?? '_')
                  ;(errors[key] ??= []).push(issue.message)
                }
                setFieldErrors(errors)
                return
              }
              run(async () => {
                await api.put(`/api/v1/users/${user.id}`, editForm)
                toast.success('Account details updated.')
                close()
              })
            }}
          >
            {error ? <Alert variant="danger">{error}</Alert> : null}

            {user.hasProfile ? (
              <Alert variant="info">
                This account is linked to a staff or student record. That record&apos;s name is shown
                across the system; the name here is only a fallback.
              </Alert>
            ) : null}

            <Field label="Full name" htmlFor="editName" required error={fieldErrors.fullName}>
              <Input
                id="editName"
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                disabled={busy}
              />
            </Field>

            <Field label="Username" htmlFor="editUsername" required error={fieldErrors.username}>
              <Input
                id="editUsername"
                value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                className="font-mono"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
              />
            </Field>

            <Field label="Email" htmlFor="editEmail" error={fieldErrors.email}>
              <Input
                id="editEmail"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                disabled={busy}
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------- Deactivate ---------------- */}
      <Dialog open={dialog === 'status'} onOpenChange={(open) => !open && close()}>
        <DialogContent
          title="Deactivate this account?"
          description={`${user.displayName} (${user.username})`}
        >
          {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

          <DangerNote>
            They will be signed out immediately on every device and will not be able to sign in
            again until the account is reactivated.
          </DangerNote>

          <Alert variant="info" className="mt-3">
            Nothing is deleted. Their attendance, marks, results and audit history stay exactly as
            they are.
          </Alert>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                run(async () => {
                  await api.patch(`/api/v1/users/${user.id}/status`, { status: 'INACTIVE' })
                  toast.success('Account deactivated and signed out everywhere.')
                  close()
                })
              }
            >
              Deactivate account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Change role ---------------- */}
      <Dialog open={dialog === 'role'} onOpenChange={(open) => !open && close()}>
        <DialogContent
          title="Change role"
          description={`${user.displayName} is currently ${ROLE_LABEL[user.role]}.`}
        >
          <div className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Field label="New role" htmlFor="nextRole" required>
              <Select
                id="nextRole"
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value as UserRole)}
                disabled={busy}
              >
                {(['ADMIN', 'STAFF', 'STUDENT'] as const).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </Field>

            <DangerNote>
              Changing the role replaces what this person can do. Their individual permission
              overrides are cleared, and they are signed out so the new role takes effect.
            </DangerNote>

            <Field
              label={`Type the username "${user.username}" to confirm`}
              htmlFor="confirmRole"
              required
            >
              <Input
                id="confirmRole"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={user.username}
                className="font-mono"
                autoCapitalize="none"
                disabled={busy}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirmText.trim().toLowerCase() !== user.username || nextRole === user.role}
              onClick={() =>
                run(async () => {
                  await api.patch(`/api/v1/users/${user.id}/role`, { role: nextRole })
                  toast.success(`Role changed to ${ROLE_LABEL[nextRole]}.`)
                  close()
                })
              }
            >
              Change role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Reset password ---------------- */}
      <Dialog
        open={dialog === 'reset'}
        onOpenChange={(open) => {
          if (!open) {
            close()
            setNewPassword(null)
          }
        }}
      >
        <DialogContent
          title={newPassword ? 'New temporary password' : 'Reset password?'}
          description={newPassword ? undefined : `${user.displayName} (${user.username})`}
        >
          {newPassword ? (
            <>
              <TemporaryPasswordPanel
                username={user.username}
                password={newPassword}
                context="reset"
              />
              <DialogFooter>
                <Button
                  onClick={() => {
                    setNewPassword(null)
                    close()
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

              <DangerNote>
                A new temporary password is generated. The current password stops working
                immediately and every session is signed out.
                {isSelf ? ' Because this is your own account, you will be signed out too.' : ''}
              </DangerNote>

              <Alert variant="info" className="mt-3">
                The new password is shown once, on the next screen. It is stored only as an
                unreadable hash, so it cannot be looked up later.
              </Alert>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await api.post<{ temporaryPassword: string }>(
                        `/api/v1/users/${user.id}/reset-password`,
                      )
                      setNewPassword(result.temporaryPassword)
                    })
                  }
                >
                  Reset password
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------- Revoke sessions ---------------- */}
      <Dialog open={dialog === 'sessions'} onOpenChange={(open) => !open && close()}>
        <DialogContent
          title="Sign out everywhere?"
          description={`${user.displayName} has ${user.activeSessionCount} active session${user.activeSessionCount === 1 ? '' : 's'}.`}
        >
          {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

          <Alert variant="info">
            Their password is unchanged — they can sign in again straight away. Use this if a device
            was lost or shared.
            {isSelf ? ' This will sign you out as well.' : ''}
          </Alert>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  const result = await api.delete<{ revoked: number }>(
                    `/api/v1/users/${user.id}/sessions`,
                  )
                  toast.success(`Signed out of ${result.revoked} session(s).`)
                  close()
                })
              }
            >
              Sign out everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

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

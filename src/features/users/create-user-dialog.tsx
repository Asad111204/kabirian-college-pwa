'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { userCreateSchema } from '@/validation/users'
import { ROLE_LABEL, TemporaryPasswordPanel } from './shared'
import type { UserRole } from '@/generated/prisma/enums'

interface ProfileOption {
  id: string
  name: string
  code: string
  detail: string | null
}

interface CreatedUser {
  user: { id: string; username: string; displayName: string }
  temporaryPassword: string
}

interface CreateUserForm {
  fullName: string
  username: string
  email: string
  role: UserRole
  status: 'ACTIVE' | 'INACTIVE'
  profileId: string
}

const EMPTY_FORM: CreateUserForm = {
  fullName: '',
  username: '',
  email: '',
  role: 'STAFF',
  status: 'ACTIVE',
  profileId: '',
}

/**
 * Creates an account and then shows the generated temporary password once.
 *
 * A staff or student account can optionally be linked to an existing profile
 * record. Where no profile exists yet (staff and student management arrive in
 * Phases 4–5), the account is created on its own and can be linked later.
 */
export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [created, setCreated] = React.useState<CreatedUser | null>(null)

  const [profiles, setProfiles] = React.useState<{ staff: ProfileOption[]; students: ProfileOption[] } | null>(null)

  /**
   * Fetch the "not yet linked" staff and student records once, when the dialog
   * first opens. Whether we are still loading is derived from the data itself
   * rather than kept as a second piece of state that could disagree with it.
   */
  const loadingProfiles = open && profiles === null

  React.useEffect(() => {
    if (!open || profiles) return
    let cancelled = false

    api
      .get<{ staff: ProfileOption[]; students: ProfileOption[] }>('/api/v1/users/unlinked-profiles')
      .then((data) => {
        if (!cancelled) setProfiles(data)
      })
      .catch(() => {
        // An empty list is the right fallback: the account can still be created
        // without a linked record.
        if (!cancelled) setProfiles({ staff: [], students: [] })
      })

    return () => {
      cancelled = true
    }
  }, [open, profiles])

  const availableProfiles =
    form.role === 'STAFF' ? (profiles?.staff ?? []) : form.role === 'STUDENT' ? (profiles?.students ?? []) : []

  function reset() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setFieldErrors({})
    setCreated(null)
  }

  function handleClose(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      // Refresh the list only after the password panel has been dismissed.
      if (created) router.refresh()
      window.setTimeout(reset, 200)
    }
  }

  /** Suggests a username from the person's name: "Muhammad Ali" -> "muhammad.ali" */
  function suggestUsername(fullName: string): string {
    return fullName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const payload = {
      fullName: form.fullName,
      username: form.username,
      email: form.email,
      role: form.role,
      status: form.status,
      ...(form.role === 'STAFF' && form.profileId ? { staffId: form.profileId } : {}),
      ...(form.role === 'STUDENT' && form.profileId ? { studentId: form.profileId } : {}),
    }

    // Checked here for instant feedback; the server checks again for real.
    const parsed = userCreateSchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_')
        ;(errors[key] ??= []).push(issue.message)
      }
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      const result = await api.post<CreatedUser>('/api/v1/users', payload)
      setCreated(result)
      toast.success(`Account created for ${result.user.displayName}.`)
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        title={created ? 'Account created' : 'Add user account'}
        description={
          created
            ? undefined
            : 'A temporary password is generated automatically. The person must change it when they first sign in.'
        }
      >
        {created ? (
          <>
            <TemporaryPasswordPanel
              username={created.user.username}
              password={created.temporaryPassword}
              context="created"
            />
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreated(null)
                  setForm(EMPTY_FORM)
                  router.refresh()
                }}
              >
                Add another
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {formError ? <Alert variant="danger">{formError}</Alert> : null}

            <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => {
                  const fullName = e.target.value
                  setForm((f) => ({
                    ...f,
                    fullName,
                    // Fill the username automatically until it is edited by hand.
                    username: f.username === suggestUsername(f.fullName) ? suggestUsername(fullName) : f.username,
                  }))
                }}
                placeholder="e.g. Muhammad Ali"
                disabled={submitting}
                autoFocus
              />
            </Field>

            <Field
              label="Username"
              htmlFor="username"
              required
              hint="Used to sign in. Letters, numbers, dots, underscores and hyphens."
              error={fieldErrors.username}
            >
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                placeholder="e.g. muhammad.ali"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                disabled={submitting}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" htmlFor="role" required error={fieldErrors.role}>
                <Select
                  id="role"
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role: e.target.value as UserRole, profileId: '' }))
                  }
                  disabled={submitting}
                >
                  {(['ADMIN', 'STAFF', 'STUDENT'] as const).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Status" htmlFor="status" error={fieldErrors.status}>
                <Select
                  id="status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))
                  }
                  disabled={submitting}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Email"
              htmlFor="email"
              hint="Optional. Not used for sign-in."
              error={fieldErrors.email}
            >
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="optional@example.com"
                disabled={submitting}
              />
            </Field>

            {form.role !== 'ADMIN' ? (
              <Field
                label={form.role === 'STAFF' ? 'Link to staff record' : 'Link to student record'}
                htmlFor="profileId"
                hint={
                  loadingProfiles
                    ? 'Loading records…'
                    : availableProfiles.length === 0
                      ? `No unlinked ${form.role === 'STAFF' ? 'staff' : 'student'} records yet — the account can be linked later.`
                      : 'Optional. Connects this login to an existing record.'
                }
                error={fieldErrors.staffId ?? fieldErrors.studentId}
              >
                <Select
                  id="profileId"
                  value={form.profileId}
                  onChange={(e) => setForm((f) => ({ ...f, profileId: e.target.value }))}
                  disabled={submitting || loadingProfiles || availableProfiles.length === 0}
                >
                  <option value="">No linked record</option>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.code} — {profile.name}
                      {profile.detail ? ` (${profile.detail})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Create account
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

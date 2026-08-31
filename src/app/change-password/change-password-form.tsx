'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { checkPasswordPolicy, PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

export function ChangePasswordForm({ username, forced }: { username: string; forced: boolean }) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // Live requirements list — the same rules the server enforces.
  const policy = checkPasswordPolicy(newPassword, username)
  const requirements = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: newPassword.length >= PASSWORD_MIN_LENGTH },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(newPassword) },
    { label: 'Contains a number', met: /[0-9]/.test(newPassword) },
    {
      label: 'Does not contain your username',
      met: newPassword.length > 0 && !newPassword.toLowerCase().includes(username.toLowerCase()),
    },
  ]

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: ['The two passwords do not match.'] })
      return
    }
    if (!policy.ok) {
      setFieldErrors({ newPassword: policy.problems })
      return
    }

    setSubmitting(true)
    try {
      await api.post('/api/v1/auth/change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      })
      toast.success('Your password has been changed.')
      router.replace('/')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-base font-semibold text-foreground">Change password</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          Signed in as <span className="font-medium text-foreground">{username}</span>
        </p>
      </div>

      {formError ? <Alert variant="danger">{formError}</Alert> : null}

      <Field label="Current password" htmlFor="currentPassword" required error={fieldErrors.currentPassword}>
        <Input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          disabled={submitting}
          autoFocus
        />
      </Field>

      <Field label="New password" htmlFor="newPassword" required error={fieldErrors.newPassword}>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          disabled={submitting}
        />
      </Field>

      <ul className="space-y-1">
        {requirements.map((requirement) => (
          <li
            key={requirement.label}
            className={`flex items-center gap-1.5 text-xs ${
              requirement.met ? 'text-success-700' : 'text-foreground-muted'
            }`}
          >
            {requirement.met ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden />
            )}
            {requirement.label}
          </li>
        ))}
      </ul>

      <Field label="Repeat new password" htmlFor="confirmPassword" required error={fieldErrors.confirmPassword}>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          disabled={submitting}
        />
      </Field>

      <Alert variant="info">
        Changing your password signs you out on all other devices.
      </Alert>

      <div className="flex flex-col gap-2">
        <Button type="submit" loading={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </Button>
        {!forced ? (
          <Button variant="ghost" asChild>
            <Link href="/">Cancel</Link>
          </Button>
        ) : null}
      </div>
    </form>
  )
}

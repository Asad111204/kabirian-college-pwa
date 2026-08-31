'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { loginSchema } from '@/validation/auth'

interface LoginResponse {
  role: 'ADMIN' | 'STAFF' | 'STUDENT'
  mustChangePassword: boolean
  redirectTo: string
}

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    // Check in the browser first for instant feedback. The server checks again —
    // that is the one that actually protects anything.
    const parsed = loginSchema.safeParse({ username, password })
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
      const result = await api.post<LoginResponse>('/api/v1/auth/login', parsed.data)
      router.replace(result.redirectTo)
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
        <h2 className="text-base font-semibold text-foreground">Sign in</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          Use the username given to you by the college.
        </p>
      </div>

      {formError ? <Alert variant="danger">{formError}</Alert> : null}

      <Field label="Username" htmlFor="username" required error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. admin or STU-0001"
          aria-invalid={Boolean(fieldErrors.username)}
          disabled={submitting}
          autoFocus
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="pr-10"
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground-muted hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" className="w-full" loading={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

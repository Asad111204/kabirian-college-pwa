'use client'

import * as React from 'react'
import { Copy, Check, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import type { UserRole, UserStatus } from '@/generated/prisma/enums'

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  STAFF: 'Staff / Teacher',
  STUDENT: 'Student',
}

const ROLE_VARIANT = {
  ADMIN: 'brand',
  STAFF: 'info',
  STUDENT: 'neutral',
} as const

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
}

/**
 * Account state at a glance. "Locked" is temporary (too many wrong passwords)
 * and is separate from "Inactive", which an administrator sets deliberately.
 */
export function AccountStatusBadge({
  status,
  isLocked,
}: {
  status: UserStatus
  isLocked: boolean
}) {
  if (status === 'INACTIVE') return <Badge variant="danger">Inactive</Badge>
  if (isLocked) return <Badge variant="warning">Locked</Badge>
  return <Badge variant="success">Active</Badge>
}

// Date formatting lives in src/lib/format.ts so that server components can call
// it too — a function exported from this 'use client' file cannot be.
export { formatDate, formatDateTime } from '@/lib/format'

/**
 * Shows a freshly generated temporary password exactly once.
 *
 * The server stores only a hash, so this really is the only chance to read it —
 * the panel says so plainly rather than letting an administrator assume they
 * can look it up later.
 */
export function TemporaryPasswordPanel({
  username,
  password,
  context,
}: {
  username: string
  password: string
  context: 'created' | 'reset'
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked; the password is visible on screen anyway.
      setCopied(false)
    }
  }

  return (
    <div className="space-y-3">
      <Alert variant="success" title={context === 'created' ? 'Account created' : 'Password reset'}>
        {context === 'created'
          ? 'Give these details to the person. They must choose their own password when they first sign in.'
          : 'Give this password to the person. They were signed out everywhere and must choose a new password when they sign in.'}
      </Alert>

      <div className="rounded-[var(--radius-control)] border border-border bg-surface-muted p-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Username
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">{username}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Temporary password
            </dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface px-2 py-1 font-mono text-base font-semibold tracking-wider text-foreground">
                {password}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </dd>
          </div>
        </dl>
      </div>

      <Alert variant="warning" title="This is shown only once">
        The password is stored as an unreadable hash, so it cannot be displayed again. Write it down
        now. If it is lost, simply reset the password again.
      </Alert>
    </div>
  )
}

/** Used before actions that could lock someone out. */
export function DangerNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-[var(--radius-control)] bg-danger-50 p-3 text-sm text-danger-700">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

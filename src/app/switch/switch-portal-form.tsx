'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { UserRole } from '@/generated/prisma/enums'

/** The button that actually moves the session, and the way back if they meant no. */
export function SwitchPortalForm({ to, next, stayPath, label }: { to: UserRole; next: string; stayPath: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/v1/auth/switch-portal', { role: to })
      router.push(next)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The portal could not be switched. Please try again.')
      setBusy(false)
    }
  }

  return (
    <>
      {error ? (
        <Alert variant="danger" title="Not switched">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={go} loading={busy}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          Continue in the {label} portal
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push(stayPath)} disabled={busy}>
          Stay where I am
        </Button>
      </div>
    </>
  )
}

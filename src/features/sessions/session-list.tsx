'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MonitorSmartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import type { SessionRow } from '@/server/services/sessions.service'

/** A session as it crosses to the browser: dates as ISO strings. */
export type SessionItem = Omit<SessionRow, 'createdAt' | 'lastActiveAt' | 'expiresAt'> & {
  createdAt: string
  lastActiveAt: string
  expiresAt: string
}

/**
 * The signed-in devices of one account, with a "sign out" per device.
 *
 * Used twice: by a person for their own devices (`self`), where signing out
 * the current one sends them to the sign-in screen; and by an administrator
 * on a user's page, where every row is somebody else's and "this device"
 * means the administrator's own session, which never appears in that list.
 */
export function SessionList({
  sessions,
  self,
  revokeBase,
  signOutOthersUrl,
  canRevoke,
}: {
  sessions: SessionItem[]
  self: boolean
  /** DELETE `${revokeBase}/${sessionId}` ends one session. A string, because a server page passes it (ADR-077). */
  revokeBase: string
  /** POST URL that ends every other session; only offered to the person themselves. */
  signOutOthersUrl?: string
  canRevoke: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const others = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="space-y-3">
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {sessions.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No signed-in devices" description="Every session for this account has ended." />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Device</TH>
                <TH className="hidden sm:table-cell">IP address</TH>
                <TH>Last active</TH>
                <TH className="hidden md:table-cell">Signed in</TH>
                {canRevoke ? (
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                ) : null}
              </TR>
            </THead>
            <TBody>
              {sessions.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <span className="font-medium text-foreground">{s.device}</span>
                    {s.isCurrent ? (
                      <Badge variant="success" className="ml-2">
                        This device
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="hidden font-mono text-xs text-foreground-muted sm:table-cell">{s.ipAddress ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-foreground-muted">{formatDateTime(s.lastActiveAt)}</TD>
                  <TD className="hidden whitespace-nowrap text-foreground-muted md:table-cell">{formatDateTime(s.createdAt)}</TD>
                  {canRevoke ? (
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === s.id}
                        disabled={busy !== null}
                        onClick={() =>
                          run(s.id, async () => {
                            const result = await api.delete<{ revoked: boolean; wasCurrent?: boolean }>(`${revokeBase}/${s.id}`)
                            if (self && result.wasCurrent) {
                              // The cookie is already cleared: the sign-in page is the only place left to go.
                              router.push('/login')
                              router.refresh()
                              return
                            }
                            toast.success(`Signed out of ${s.device}.`)
                            router.refresh()
                          })
                        }
                      >
                        Sign out
                      </Button>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}

      {self && signOutOthersUrl && others > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'others'}
            disabled={busy !== null}
            onClick={() =>
              run('others', async () => {
                const result = await api.post<{ revoked: number }>(signOutOthersUrl, {})
                toast.success(`Signed out of ${result.revoked} other device${result.revoked === 1 ? '' : 's'}.`)
                router.refresh()
              })
            }
          >
            Sign out all other devices
          </Button>
        </div>
      ) : null}
    </div>
  )
}

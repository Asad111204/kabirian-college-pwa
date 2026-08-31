'use client'

/**
 * The Google Drive panel on the Settings page.
 *
 * Everything shown here is safe to display: which account is connected, when,
 * and whether the configuration is complete. No token, secret or key is ever
 * sent to the browser, because the API that feeds this panel does not have
 * access to them either.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, CircleAlert, HardDrive, Link2, RefreshCw, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api-client'
import { formatBytes, formatDateTime } from '@/lib/format'

export interface DriveStatusView {
  connected: boolean
  credentialsConfigured: boolean
  encryptionConfigured: boolean
  storageProvider: string
  redirectUri: string
  scope: string
  accountEmail: string | null
  accountName: string | null
  connectedAt: string | null
  rootFolderId: string | null
  studentsFolderId: string | null
  staffFolderId: string | null
}

interface TestResult {
  ok: true
  accountEmail: string | null
  quotaUsedBytes: number | null
  quotaLimitBytes: number | null
  rootFolderId: string | null
}

export function GoogleDriveCard({
  status,
  notice,
}: {
  status: DriveStatusView
  notice: { kind: 'success' | 'error'; message: string } | null
}) {
  const router = useRouter()
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<TestResult | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

  const blockedReason = !status.credentialsConfigured
    ? 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI must all be set in .env before you can connect.'
    : !status.encryptionConfigured
      ? 'APP_ENCRYPTION_KEY must be set in .env before a Google token can be stored safely.'
      : null

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.post<TestResult>('/api/v1/settings/google/test')
      setTestResult(result)
      toast.success('Google Drive answered normally.')
      // The test also creates the college folders if they were missing, so the
      // page is re-read to pick up the new folder link.
      if (result.rootFolderId && !status.rootFolderId) router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The test could not be completed.')
    } finally {
      setTesting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await api.delete('/api/v1/settings/google')
      setConfirmDisconnect(false)
      setTestResult(null)
      toast.success('Google Drive disconnected. No files were deleted.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not disconnect.')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-foreground-muted" aria-hidden />
              Google Drive
            </CardTitle>
            <CardDescription>
              Where student and staff documents are stored. The database keeps the record of every
              document; Drive keeps the file itself.
            </CardDescription>
          </div>

          {status.connected ? (
            <Badge variant="success">Connected</Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {notice ? (
          <Alert variant={notice.kind === 'success' ? 'success' : 'danger'}>{notice.message}</Alert>
        ) : null}

        {blockedReason ? <Alert variant="warning" title="Not configured yet">{blockedReason}</Alert> : null}

        {status.connected ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Google account">
              {status.accountEmail ?? 'Unknown'}
              {status.accountName ? (
                <span className="block text-xs text-foreground-muted">{status.accountName}</span>
              ) : null}
            </Detail>
            <Detail label="Connected">{formatDateTime(status.connectedAt)}</Detail>
            <Detail label="Permission granted">
              <code className="text-xs">drive.file</code>
              <span className="block text-xs text-foreground-muted">
                This app can only see files it created itself. It cannot read the rest of that
                Google account.
              </span>
            </Detail>
            <Detail label="College folder">
              {status.rootFolderId ? (
                <a
                  href={`https://drive.google.com/drive/folders/${status.rootFolderId}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open in Google Drive
                </a>
              ) : (
                <span className="text-foreground-muted">Not created yet</span>
              )}
            </Detail>
          </dl>
        ) : (
          <p className="text-sm text-foreground-muted">
            No Google account is connected, so documents cannot be uploaded yet. Connecting opens
            Google&rsquo;s own sign-in page — this application never sees the password.
          </p>
        )}

        {testResult ? (
          <Alert variant="success" title="Google answered">
            Connected as {testResult.accountEmail ?? 'unknown account'}.{' '}
            {testResult.quotaLimitBytes != null ? (
              <>
                {formatBytes(testResult.quotaUsedBytes)} of {formatBytes(testResult.quotaLimitBytes)}{' '}
                Drive storage used.
              </>
            ) : (
              'This account has no fixed storage limit.'
            )}
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {status.connected ? (
            <>
              <Button variant="secondary" onClick={handleTest} loading={testing}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Test connection
              </Button>
              <Button variant="secondary" asChild>
                <a href="/api/v1/settings/google/connect">
                  <Link2 className="h-4 w-4" aria-hidden />
                  Reconnect
                </a>
              </Button>
              <Button variant="danger" onClick={() => setConfirmDisconnect(true)}>
                <Unlink className="h-4 w-4" aria-hidden />
                Disconnect
              </Button>
            </>
          ) : (
            // `disabled` cannot be forwarded onto an anchor, so a blocked
            // Connect is rendered as a real disabled button instead of a link.
            blockedReason ? (
              <Button disabled>
                <Link2 className="h-4 w-4" aria-hidden />
                Connect Google Drive
              </Button>
            ) : (
              <Button asChild>
                <a href="/api/v1/settings/google/connect">
                  <Link2 className="h-4 w-4" aria-hidden />
                  Connect Google Drive
                </a>
              </Button>
            )
          )}
        </div>

        <ConfigChecklist status={status} />
      </CardContent>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent
          title="Disconnect Google Drive?"
          description="This application will forget its Google token."
        >
          <div className="space-y-3 text-sm">
            <Alert variant="info" title="Nothing is deleted">
              Every file stays in Google Drive and every document record stays in the database.
              Uploading and viewing documents will stop working until you connect again.
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDisconnect} loading={disconnecting}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  )
}

/**
 * A plain reading of the .env values that matter, so a misconfiguration is
 * visible here rather than only as a failed upload later.
 */
function ConfigChecklist({ status }: { status: DriveStatusView }) {
  const rows: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: 'OAuth credentials',
      ok: status.credentialsConfigured,
      detail: status.credentialsConfigured ? 'Set in .env' : 'Missing from .env',
    },
    {
      label: 'Encryption key',
      ok: status.encryptionConfigured,
      detail: status.encryptionConfigured ? 'Valid 32-byte key' : 'APP_ENCRYPTION_KEY missing or wrong length',
    },
    {
      label: 'Storage provider',
      ok: status.storageProvider === 'google_drive',
      detail:
        status.storageProvider === 'google_drive'
          ? 'STORAGE_PROVIDER=google_drive'
          : `STORAGE_PROVIDER=${status.storageProvider} — set it to google_drive to enable uploads`,
    },
  ]

  return (
    <details className="rounded-[var(--radius-control)] border border-border bg-surface-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">Configuration details</summary>

      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2 text-sm">
            {row.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="font-medium">{row.label}</span>
              <span className="block break-words text-xs text-foreground-muted">{row.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 break-words text-xs text-foreground-muted">
        Redirect URI in use: <code>{status.redirectUri || 'not set'}</code>
        <span className="block">
          This must match the authorised redirect URI in the Google Cloud console exactly.
        </span>
      </p>
    </details>
  )
}

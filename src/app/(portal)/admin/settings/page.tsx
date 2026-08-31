import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getDriveStatus } from '@/server/services/google-drive.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { GoogleDriveCard } from '@/features/settings/google-drive-card'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

/**
 * Settings — currently the Google Drive connection.
 *
 * The status is read on the server by a service that checks the ADMIN role and
 * the `settings.manage` permission, so the page cannot render for anyone else
 * even if they reach the URL directly.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const status = await getDriveStatus(ctx)

  // The OAuth routes are browser navigations, so they report their outcome
  // through the query string rather than a JSON body.
  const params = await searchParams
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const connected = first(params.drive_connected)
  const failed = first(params.drive_error)

  const notice = connected
    ? {
        kind: 'success' as const,
        message:
          connected === '1'
            ? 'Google Drive connected.'
            : `Google Drive connected as ${connected}.`,
      }
    : failed
      ? { kind: 'error' as const, message: failed }
      : null

  return (
    <>
      <PageHeader
        title="Settings"
        description="Connections and options for the whole college. Changes here affect every user."
      />

      <div className="space-y-4">
        <GoogleDriveCard status={status} notice={notice} />

        <Alert variant="info" title="Where documents live">
          Files are stored in Google Drive; the database stores the record of each document — who it
          belongs to, what type it is, and who uploaded it. Drive is never used as the database, and
          no document is ever made public.
        </Alert>
      </div>
    </>
  )
}

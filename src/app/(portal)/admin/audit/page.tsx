import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requirePortalAccess } from '@/server/auth/context'
import { getAuditFilterOptions, listAuditLogs } from '@/server/services/audit.service'
import { auditListQuerySchema } from '@/validation/audit'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { AuditViewer } from '@/features/audit/audit-viewer'

export const metadata: Metadata = { title: 'Audit log' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Audit Log.
 *
 * The server authenticates, authorises (`audit.view`) and loads one page for
 * the filters in the URL. Only the columns the viewer shows cross to the
 * browser — never a snapshot; the detail dialog asks the API for a redacted
 * change list one entry at a time.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])

  if (!can(ctx, 'audit.view')) {
    return (
      <>
        <PageHeader title="Audit log" />
        <Alert variant="warning" title="The audit log is not available to this account">
          Viewing the audit log needs the “view the audit log” permission. An administrator can grant it in{' '}
          <Link href="/admin/users">User Accounts</Link>.
        </Alert>
      </>
    )
  }

  const params = await searchParams
  const parsed = auditListQuerySchema.safeParse(params)
  const query = parsed.success ? parsed.data : auditListQuerySchema.parse({})

  const [result, options] = await Promise.all([listAuditLogs(ctx, query), getAuditFilterOptions(ctx)])

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Every change made through the system is recorded here as it happens; nothing in this log can be edited or deleted."
      />
      {!parsed.success ? (
        <Alert variant="warning" className="mb-4">
          Some of the filters in the address were not valid, so the full log is shown.
        </Alert>
      ) : null}
      <AuditViewer
        items={result.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        filters={{
          actor: query.actor ?? '',
          module: query.module ?? '',
          action: query.action ?? '',
          entityType: query.entityType ?? '',
          dateFrom: query.dateFrom ?? '',
          dateTo: query.dateTo ?? '',
          includeSignIns: query.includeSignIns,
        }}
        options={options}
      />
    </>
  )
}

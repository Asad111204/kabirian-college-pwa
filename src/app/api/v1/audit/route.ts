import { reportRoute } from '@/server/api/report-response'
import { exportAuditLogs, listAuditLogs, type AuditListItem } from '@/server/services/audit.service'
import { auditListQuerySchema, type AuditListQuery } from '@/validation/audit'
import type { PaginatedResult } from '@/server/services/service-utils'

type ListOut = PaginatedResult<AuditListItem> | { generatedAt: Date; total: number; rows: AuditListItem[] }

/**
 * GET /api/v1/audit?…&format=json|csv — one page of the audit trail, or a CSV
 * of every row the same filters match (capped). ADMIN and `audit.view`.
 * The snapshots are never part of this response.
 */
export const GET = reportRoute<AuditListQuery, ListOut, AuditListItem>({
  schema: auditListQuerySchema,
  load: (ctx, query) => (query.format === 'csv' ? exportAuditLogs(ctx, query) : listAuditLogs(ctx, query)),
  rows: (out) => ('rows' in out ? out.rows : out.items),
  columns: () => [
    { header: 'When', value: (r) => r.createdAt.toISOString() },
    { header: 'Who', value: (r) => r.actor?.username ?? 'system' },
    { header: 'Name', value: (r) => r.actor?.name ?? '' },
    { header: 'Role', value: (r) => r.actorRole ?? '' },
    { header: 'Action', value: (r) => r.action },
    { header: 'Did what', value: (r) => r.description },
    { header: 'Record type', value: (r) => r.entityType },
    { header: 'Record', value: (r) => r.entityLabel ?? '' },
    { header: 'IP address', value: (r) => r.ipAddress ?? '' },
  ],
  fileName: (_out, query) => ['audit log', query.module ?? null, query.dateFrom ?? null, query.dateTo ?? null],
})

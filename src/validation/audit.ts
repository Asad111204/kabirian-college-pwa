import { z } from 'zod'
import { isoDate, uuid } from './common'

/**
 * Filters for the audit viewer.
 *
 * The action and module filters are shaped like the keys the services write
 * (`module.verb`), so nothing a browser sends can become a Prisma condition
 * other than an equality or a prefix on an indexed column.
 */
export const AUDIT_ACTION_KEY = /^[a-z_]+\.[a-z_]+$/
const AUDIT_MODULE_KEY = /^[a-z_]+$/

const optional = (schema: z.ZodType<string>) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  /** Username or name of the person who acted — a contains-match. */
  actor: z.string().trim().max(100).optional(),
  action: optional(z.string().regex(AUDIT_ACTION_KEY, 'That is not an audit action.')),
  module: optional(z.string().regex(AUDIT_MODULE_KEY, 'That is not a module.')),
  entityType: optional(z.string().regex(AUDIT_MODULE_KEY, 'That is not a record type.')),
  entityId: optional(uuid),
  dateFrom: optional(isoDate),
  dateTo: optional(isoDate),
  /** Sign-ins and sign-outs are hidden unless asked for: they drown everything else. */
  includeSignIns: z
    .preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean())
    .default(false),
  format: z.enum(['json', 'csv']).default('json'),
})

export type AuditListQuery = z.infer<typeof auditListQuerySchema>

/** How many rows one CSV export may carry: enough for a term, not the whole table. */
export const AUDIT_EXPORT_LIMIT = 5000

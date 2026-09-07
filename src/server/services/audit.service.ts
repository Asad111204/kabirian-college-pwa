/**
 * The audit viewer.
 *
 * Reading the audit trail is an administrator's job and needs `audit.view`.
 * Two rules keep the viewer safe to show:
 *
 *   1. The list never selects the before/after snapshots or the metadata at
 *      all — it is built from the action, the actor, the record label and
 *      the time, the same columns the dashboard reads.
 *   2. The detail view does read the snapshots, but only ever returns what
 *      `audit-redaction.ts` lets through: secrets and national IDs hidden,
 *      internal references dropped, and only the fields that changed.
 *
 * Nothing here writes: the audit table is append-only, and viewing it is not
 * itself audited (that would double the table for no security gain).
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { NotFoundError } from '../api/errors'
import { assertAdminArea, paginate, paginatedResult, type PaginatedResult } from './service-utils'
import { collegeLocalToInstant } from '../time/college-date'
import { describeAction, describeModule, moduleOfAction, toneFor, type ActivityTone } from './dashboard-helpers'
import { describeMetadata, diffSnapshots, type ChangedField } from '../audit/audit-redaction'
import { AUDIT_EXPORT_LIMIT, type AuditListQuery } from '@/validation/audit'

export interface AuditListItem {
  id: string
  action: string
  module: string
  /** "created the account" */
  description: string
  tone: ActivityTone
  entityType: string
  /** Present so the viewer can link to the record; never a secret. */
  entityId: string | null
  entityLabel: string | null
  actor: { username: string; name: string } | null
  actorRole: string | null
  ipAddress: string | null
  createdAt: Date
}

export interface AuditEntryDetail extends AuditListItem {
  userAgent: string | null
  /** Fields that differ between the redacted before and after snapshots. */
  changes: ChangedField[]
  /** Redacted metadata facts, e.g. "Sessions revoked: 3". */
  facts: { field: string; value: string }[]
  /** True when a snapshot existed but nothing in it is showable. */
  hasHiddenDetail: boolean
}

export interface AuditFilterOptions {
  modules: { key: string; label: string }[]
  actions: { key: string; label: string; module: string }[]
  entityTypes: string[]
}

const SIGN_IN_ACTIONS = ['auth.login', 'auth.logout', 'auth.login_failed']

const listSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  actorRole: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { username: true, fullName: true, staff: { select: { fullName: true } }, student: { select: { fullName: true } } } },
} satisfies Prisma.AuditLogSelect

type ListRow = Prisma.AuditLogGetPayload<{ select: typeof listSelect }>

function requireAuditViewer(ctx: AuthContext): void {
  assertAdminArea(ctx, 'The audit log')
  authorize(ctx, 'audit.view')
}

function toItem(row: ListRow): AuditListItem {
  return {
    id: row.id,
    action: row.action,
    module: moduleOfAction(row.action),
    description: describeAction(row.action),
    tone: toneFor(row.action),
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    actor: row.actor
      ? {
          username: row.actor.username,
          name: row.actor.staff?.fullName ?? row.actor.student?.fullName ?? row.actor.fullName ?? row.actor.username,
        }
      : null,
    actorRole: row.actorRole,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  }
}

/**
 * The action condition: one exact action wins; otherwise a module prefix, with
 * sign-ins hidden unless they were asked for (or the module is `auth`).
 */
function actionFilter(query: AuditListQuery): Prisma.AuditLogWhereInput['action'] {
  if (query.action) return query.action
  const filter: Prisma.StringFilter = {}
  if (query.module) filter.startsWith = `${query.module}.`
  if (!query.includeSignIns && query.module !== 'auth') filter.notIn = SIGN_IN_ACTIONS
  return Object.keys(filter).length > 0 ? filter : undefined
}

/** Turns the query into a Prisma filter: equality and prefix on indexed columns only. */
function whereFor(query: AuditListQuery): Prisma.AuditLogWhereInput {
  const action = actionFilter(query)
  return {
    ...(action !== undefined ? { action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actor
      ? {
          actor: {
            OR: [
              { username: { contains: query.actor, mode: 'insensitive' } },
              { fullName: { contains: query.actor, mode: 'insensitive' } },
              { staff: { fullName: { contains: query.actor, mode: 'insensitive' } } },
              { student: { fullName: { contains: query.actor, mode: 'insensitive' } } },
            ],
          },
        }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: collegeLocalToInstant(`${query.dateFrom}T00:00`) } : {}),
            // "to 8 September" means up to the end of that college day.
            ...(query.dateTo ? { lt: new Date(collegeLocalToInstant(`${query.dateTo}T00:00`).getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
  }
}

/** One page of the audit trail, newest first. */
export async function listAuditLogs(ctx: AuthContext, query: AuditListQuery): Promise<PaginatedResult<AuditListItem>> {
  requireAuditViewer(ctx)
  const where = whereFor(query)
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, select: listSelect, orderBy: { createdAt: 'desc' }, ...paginate(query.page, query.pageSize) }),
    prisma.auditLog.count({ where }),
  ])
  return paginatedResult(rows.map(toItem), total, query.page, query.pageSize)
}

/** The rows a CSV export carries: the same filter, newest first, capped. */
export async function exportAuditLogs(ctx: AuthContext, query: AuditListQuery): Promise<{ generatedAt: Date; total: number; rows: AuditListItem[] }> {
  requireAuditViewer(ctx)
  const where = whereFor(query)
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, select: listSelect, orderBy: { createdAt: 'desc' }, take: AUDIT_EXPORT_LIMIT }),
    prisma.auditLog.count({ where }),
  ])
  return { generatedAt: new Date(), total, rows: rows.map(toItem) }
}

/** One entry with its redacted change list. */
export async function getAuditEntry(ctx: AuthContext, id: string): Promise<AuditEntryDetail> {
  requireAuditViewer(ctx)
  const row = await prisma.auditLog.findUnique({
    where: { id },
    select: { ...listSelect, userAgent: true, beforeData: true, afterData: true, metadata: true },
  })
  if (!row) throw new NotFoundError('audit entry')

  const changes = diffSnapshots(row.beforeData, row.afterData)
  const facts = describeMetadata(row.metadata)
  const hadSnapshot = row.beforeData !== null || row.afterData !== null || row.metadata !== null

  return {
    ...toItem(row),
    userAgent: row.userAgent,
    changes,
    facts,
    hasHiddenDetail: hadSnapshot && changes.length === 0 && facts.length === 0,
  }
}

/** The filter lists, read from what has actually been recorded. */
export async function getAuditFilterOptions(ctx: AuthContext): Promise<AuditFilterOptions> {
  requireAuditViewer(ctx)
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
  ])
  const modules = [...new Set(actions.map((a) => moduleOfAction(a.action)))].sort()
  return {
    modules: modules.map((key) => ({ key, label: describeModule(key) })),
    actions: actions.map((a) => ({ key: a.action, label: describeAction(a.action), module: moduleOfAction(a.action) })),
    entityTypes: entityTypes.map((e) => e.entityType),
  }
}

/**
 * Small helpers shared by the service layer.
 */
import 'server-only'
import { ConflictError, ForbiddenError } from '../api/errors'
import type { AuthContext } from '../auth/context'

/**
 * Prisma error codes we care about:
 *   P2002 — unique constraint failed (duplicate)
 *   P2003 — foreign key constraint failed (still referenced / parent missing)
 *   P2025 — record not found
 */
export function prismaErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

/**
 * The columns or index involved in a unique-constraint failure.
 *
 * Prisma reports this in two different shapes depending on how it is connected:
 *   - classic engine:    meta.target = ['code']  (or a string)
 *   - driver adapter (Prisma 7, what we use):
 *       meta.driverAdapterError.cause.constraint.index = 'programs_code_key'
 * We read both, so the friendly per-field messages keep working.
 */
function prismaConflictTargets(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('meta' in error)) return []

  const meta = (error as {
    meta?: {
      target?: unknown
      driverAdapterError?: {
        cause?: { constraint?: { index?: unknown; fields?: unknown } }
      }
    }
  }).meta

  const targets: string[] = []

  const target = meta?.target
  if (Array.isArray(target)) targets.push(...target.map(String))
  else if (typeof target === 'string') targets.push(target)

  const constraint = meta?.driverAdapterError?.cause?.constraint
  if (constraint) {
    if (typeof constraint.index === 'string') targets.push(constraint.index)
    if (Array.isArray(constraint.fields)) targets.push(...constraint.fields.map(String))
  }

  return targets
}

/**
 * Runs a write and turns a duplicate-key database error into a friendly,
 * field-level message instead of a 500.
 *
 * `messages` maps a column name (as the database knows it) to what the user
 * should read, e.g. { code: ['A program with this code already exists.'] }.
 */
export async function withUniqueConstraintHandling<T>(
  operation: () => Promise<T>,
  messages: Record<string, string>,
  fallbackMessage = 'Another record already uses one of these values.',
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (prismaErrorCode(error) !== 'P2002') throw error

    const targets = prismaConflictTargets(error)
    for (const target of targets) {
      for (const [column, message] of Object.entries(messages)) {
        if (target === column || target.includes(column)) {
          throw new ConflictError(message, { [toFieldName(column)]: [message] })
        }
      }
    }
    throw new ConflictError(fallbackMessage)
  }
}

/** database column `sort_order` -> form field `sortOrder` */
function toFieldName(column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export interface ReferenceCount {
  label: string
  count: number
}

/**
 * Blocks a permanent delete when other records still point at this one.
 *
 * Academic records must never be casually deleted (requirement 15): once a
 * program has students, deleting it would orphan their history. The admin is
 * told to deactivate it instead, which keeps every historical record readable.
 */
export function assertNotReferenced(
  entityLabel: string,
  references: ReferenceCount[],
): void {
  const blocking = references.filter((r) => r.count > 0)
  if (blocking.length === 0) return

  const detail = blocking.map((r) => `${r.count} ${r.label}`).join(', ')
  throw new ConflictError(
    `${entityLabel} cannot be deleted because it is already used by ${detail}. ` +
      `Deactivate it instead — that hides it from new records while keeping all history intact.`,
  )
}

/** Builds Prisma's skip/take from a page number. */
export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export interface PaginatedResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * The admin-area boundary (ADR-058).
 *
 * Holding a permission answers "may they do this kind of thing"; it does not
 * answer "over whose records". Staff hold `students.view` so they can see the
 * students they teach, but the admin services return the whole college, so they
 * additionally require the ADMIN role. Staff reach their own scoped data
 * through staff-portal.service.ts instead.
 */
export function assertAdminArea(ctx: AuthContext, area: string): void {
  if (ctx.role !== 'ADMIN') {
    throw new ForbiddenError(`${area} is only available to administrators.`, {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
}

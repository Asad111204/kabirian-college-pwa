import { describe, expect, it } from 'vitest'
import { AUDIT_EXPORT_LIMIT, auditListQuerySchema } from '@/validation/audit'

/** The audit filters: what a browser may ask the audit query to do. */

describe('the audit list query', () => {
  it('defaults to the first page, sign-ins hidden, as JSON', () => {
    const parsed = auditListQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
    expect(parsed.includeSignIns).toBe(false)
    expect(parsed.format).toBe('json')
    expect(parsed.module).toBeUndefined()
  })

  it('treats an empty select as no filter, the way a form sends it', () => {
    const parsed = auditListQuerySchema.parse({ module: '', action: '', entityType: '', dateFrom: '', dateTo: '', entityId: '' })
    expect(parsed.module).toBeUndefined()
    expect(parsed.action).toBeUndefined()
    expect(parsed.dateFrom).toBeUndefined()
    expect(parsed.entityId).toBeUndefined()
  })

  it('accepts the shapes the services write: module.verb, a module, a record type, dates', () => {
    const parsed = auditListQuerySchema.parse({
      action: 'user.password_reset',
      module: 'user',
      entityType: 'user',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-08',
      includeSignIns: 'true',
      actor: '  admin ',
      format: 'csv',
    })
    expect(parsed.action).toBe('user.password_reset')
    expect(parsed.includeSignIns).toBe(true)
    expect(parsed.actor).toBe('admin')
    expect(parsed.format).toBe('csv')
  })

  it('refuses anything that is not an action key, a module name or a date', () => {
    expect(auditListQuerySchema.safeParse({ action: "user.created' OR 1=1" }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ module: 'User Accounts' }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ entityType: 'student;' }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ dateFrom: '1 Sept' }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ entityId: 'not-a-uuid' }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false)
    expect(auditListQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false)
  })

  it('caps an export well below the whole table', () => {
    expect(AUDIT_EXPORT_LIMIT).toBe(5000)
  })
})

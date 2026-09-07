import { describe, expect, it } from 'vitest'
import { redactForLog, redactText } from '@/server/logger'

/**
 * What can never reach a log line. By key (a field called password) and by
 * value (thirteen digits that look like a CNIC, wherever they turn up).
 */
describe('redactText', () => {
  it('replaces a CNIC / B-Form number, with or without dashes, inside any text', () => {
    expect(redactText('duplicate cnic 12345-1234567-1 for STU-0001')).toBe('duplicate cnic [redacted-id] for STU-0001')
    expect(redactText('value 1234512345671 rejected')).toBe('value [redacted-id] rejected')
  })

  it('leaves ordinary numbers alone', () => {
    expect(redactText('roll 12, phone 0300-1234567, code 2026-27')).toBe('roll 12, phone 0300-1234567, code 2026-27')
  })
})

describe('redactForLog', () => {
  it('hides secret and identity fields by key, case-insensitively', () => {
    const out = redactForLog({ Password: 'x', tokenHash: 'y', CNIC: 'z', driveFileId: 'd', encrypted_refresh_token: 'r', username: 'admin' }) as Record<string, unknown>
    expect(out.Password).toBe('[redacted]')
    expect(out.tokenHash).toBe('[redacted]')
    expect(out.CNIC).toBe('[redacted]')
    expect(out.driveFileId).toBe('[redacted]')
    expect(out.encrypted_refresh_token).toBe('[redacted]')
    expect(out.username).toBe('admin')
  })

  it('scans values too, however deep, including inside errors', () => {
    const out = redactForLog({ nested: { list: ['ok', 'cnic 12345-1234567-1'] }, error: new Error('unique cnic_bform_number 12345-1234567-1') }) as {
      nested: { list: string[] }
      error: { message: string }
    }
    expect(out.nested.list[1]).toBe('cnic [redacted-id]')
    expect(out.error.message).toBe('unique cnic_bform_number [redacted-id]')
  })

  it('stops at a sensible depth rather than recursing forever', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let i = 0; i < 10; i++) {
      cursor.next = {}
      cursor = cursor.next as Record<string, unknown>
    }
    expect(JSON.stringify(redactForLog(deep))).toContain('[deep]')
  })
})

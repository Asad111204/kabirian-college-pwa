import { describe, expect, it } from 'vitest'
import { HIDDEN, describeMetadata, diffSnapshots, flattenSnapshot, humaniseKey } from '@/server/audit/audit-redaction'

/**
 * What the audit viewer may show from a stored snapshot. These rules are the
 * only thing between a snapshot and the screen, so each is pinned down.
 */

describe('humaniseKey', () => {
  it('turns a code key into words', () => {
    expect(humaniseKey('fullName')).toBe('Full name')
    expect(humaniseKey('admission_number')).toBe('Admission number')
    expect(humaniseKey('rollNumber')).toBe('Roll number')
  })
})

describe('flattenSnapshot', () => {
  it('hides a value by the name of its key, whatever it holds', () => {
    const out = flattenSnapshot({ passwordHash: 'x', tokenHash: 'y', cnicBformNumber: '12345-1234567-1', driveFileId: 'abc', fatherCnic: 'z' })
    expect(out.get('Password hash')).toBe(HIDDEN)
    expect(out.get('Token hash')).toBe(HIDDEN)
    expect(out.get('Cnic bform number')).toBe(HIDDEN)
    expect(out.get('Drive file')).toBeUndefined() // "driveFileId" is a reference key: dropped altogether
    expect(out.get('Father cnic')).toBe(HIDDEN)
  })

  it('drops internal references altogether', () => {
    const out = flattenSnapshot({ id: '1', sectionId: '2', actor_user_id: '3', ids: ['4'], fullName: 'Ali' })
    expect([...out.keys()]).toEqual(['Full name'])
  })

  it('hides a national ID by its shape, whatever the key is called', () => {
    const out = flattenSnapshot({ note: '12345-1234567-1', other: '1234512345671', fine: '12345' })
    expect(out.get('Note')).toBe(HIDDEN)
    expect(out.get('Other')).toBe(HIDDEN)
    expect(out.get('Fine')).toBe('12345')
  })

  it('drops a UUID value, whatever the key is called', () => {
    const out = flattenSnapshot({ placement: '11111111-1111-4111-8111-111111111111', name: 'A' })
    expect(out.has('Placement')).toBe(false)
    expect(out.get('Name')).toBe('A')
  })

  it('shows booleans and numbers as words and figures, null as nothing', () => {
    const out = flattenSnapshot({ isPinned: true, capacity: 40, closedAt: null })
    expect(out.get('Is pinned')).toBe('Yes')
    expect(out.get('Capacity')).toBe('40')
    expect(out.get('Closed at')).toBeNull()
  })

  it('flattens nested objects with a path, and joins arrays of scalars', () => {
    const out = flattenSnapshot({ placement: { className: '1st Year', section: 'A' }, removed: ['a.b', 'c.d'] })
    expect(out.get('Placement · Class name')).toBe('1st Year')
    expect(out.get('Placement · Section')).toBe('A')
    expect(out.get('Removed')).toBe('a.b, c.d')
  })

  it('does not recurse forever', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let i = 0; i < 20; i++) {
      cursor.next = {}
      cursor = cursor.next as Record<string, unknown>
    }
    cursor.leaf = 'x'
    expect(() => flattenSnapshot(deep)).not.toThrow()
    expect(flattenSnapshot(deep).size).toBe(0)
  })
})

describe('diffSnapshots', () => {
  it('lists only the fields that differ', () => {
    const changes = diffSnapshots(
      { fullName: 'Ali', admissionNumber: 'A-1', fatherName: 'Raza' },
      { fullName: 'Ali Raza', admissionNumber: 'A-1', fatherName: 'Raza' },
    )
    expect(changes).toEqual([{ field: 'Full name', before: 'Ali', after: 'Ali Raza' }])
  })

  it('treats a creation as a change from nothing and a deletion as a change to nothing', () => {
    expect(diffSnapshots(null, { status: 'ACTIVE' })).toEqual([{ field: 'Status', before: null, after: 'ACTIVE' }])
    expect(diffSnapshots({ status: 'ACTIVE' }, null)).toEqual([{ field: 'Status', before: 'ACTIVE', after: null }])
  })

  it('never lets a hidden value through as "before" or "after"', () => {
    const changes = diffSnapshots({ cnic: '11111-1111111-1' }, { cnic: '22222-2222222-2' })
    // Both sides redact to the same marker, so there is nothing to show.
    expect(changes).toEqual([])
  })

  it('shows a change only in references as no change at all', () => {
    expect(diffSnapshots({ sectionId: 'a' }, { sectionId: 'b' })).toEqual([])
  })
})

describe('describeMetadata', () => {
  it('turns the metadata bag into label/value pairs, minus references and secrets', () => {
    expect(describeMetadata({ sessionsRevoked: 3, device: 'Chrome on Windows', userId: 'x', token: 'y' })).toEqual([
      { field: 'Sessions revoked', value: '3' },
      { field: 'Device', value: 'Chrome on Windows' },
      { field: 'Token', value: HIDDEN },
    ])
    expect(describeMetadata(null)).toEqual([])
  })
})

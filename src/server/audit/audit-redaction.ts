/**
 * What the audit viewer may show from a stored snapshot.
 *
 * Audit rows carry `before`/`after` snapshots written by the services. By
 * design those never contain passwords, hashes or tokens — but they do carry
 * whatever a service chose to record, and a future service might record more
 * than it should. So the viewer does not trust the snapshots: every value
 * passes through this module first, and the rules here are tested.
 *
 *   - a key that names a secret or a national ID is shown as "[hidden]"
 *   - a key that is an internal database reference is dropped altogether
 *   - a value shaped like a CNIC / B-Form number is shown as "[hidden]"
 *     whatever its key
 *   - a value shaped like a UUID is dropped, whatever its key
 *
 * Pure functions, no imports: the same code runs in tests and on the server.
 */

/** Keys whose values must never be displayed, whatever they contain. */
const SENSITIVE_KEY = /password|passwd|secret|token|hash|cnic|bform|b_form|drive|refresh|api[_-]?key|authorization|cookie|salt/i

/** Keys that hold internal references: `id`, `sectionId`, `actor_user_id`, `ids`. */
const REFERENCE_KEY = /(^id$)|(^ids$)|(Id$)|(Ids$)|(_id$)|(_ids$)/

/** 13-digit Pakistani national ID, with or without the dashes. */
const NATIONAL_ID_VALUE = /^\d{5}-?\d{7}-?\d$/

const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const HIDDEN = '[hidden]'

export interface ChangedField {
  /** Human label, e.g. "Full name" or "Placement · section". */
  field: string
  before: string | null
  after: string | null
}

/** `fullName` → "Full name", `admission_number` → "Admission number". */
export function humaniseKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** One displayable string for a leaf value, or null when it should not appear. */
function displayLeaf(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (NATIONAL_ID_VALUE.test(trimmed)) return HIDDEN
    if (UUID_VALUE.test(trimmed)) return undefined
    return value
  }
  return undefined
}

/**
 * Flattens a snapshot into `path → display string`, applying every rule.
 * Arrays of scalars become one comma-separated value; arrays of objects are
 * flattened by index. Depth is capped so a malformed snapshot cannot recurse
 * forever.
 */
export function flattenSnapshot(value: unknown, prefix = '', depth = 0, out: Map<string, string | null> = new Map()): Map<string, string | null> {
  if (depth > 5) return out
  if (value === null || typeof value !== 'object') {
    if (prefix === '') return out
    const leaf = displayLeaf(value)
    if (leaf !== undefined) out.set(prefix, leaf)
    return out
  }

  if (Array.isArray(value)) {
    const scalars = value.every((v) => v === null || typeof v !== 'object')
    if (scalars) {
      const parts = value.map(displayLeaf).filter((v): v is string => typeof v === 'string')
      if (prefix !== '' && parts.length > 0) out.set(prefix, parts.join(', '))
      return out
    }
    value.forEach((item, index) => flattenSnapshot(item, prefix ? `${prefix} · ${index + 1}` : String(index + 1), depth + 1, out))
    return out
  }

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REFERENCE_KEY.test(key)) continue
    const path = prefix ? `${prefix} · ${humaniseKey(key)}` : humaniseKey(key)
    if (SENSITIVE_KEY.test(key)) {
      out.set(path, HIDDEN)
      continue
    }
    flattenSnapshot(val, path, depth + 1, out)
  }
  return out
}

/**
 * The fields that differ between two snapshots, both redacted. With only an
 * `after` (a creation) every field is a change from nothing; with only a
 * `before` (a deletion) every field is a change to nothing.
 */
export function diffSnapshots(before: unknown, after: unknown): ChangedField[] {
  const a = flattenSnapshot(before)
  const b = flattenSnapshot(after)
  const keys = new Set<string>([...a.keys(), ...b.keys()])
  const changes: ChangedField[] = []
  for (const key of keys) {
    const from = a.has(key) ? a.get(key)! : null
    const to = b.has(key) ? b.get(key)! : null
    if (from === to) continue
    changes.push({ field: key, before: from, after: to })
  }
  return changes
}

/** Metadata is a flat bag of facts, shown as label/value pairs after redaction. */
export function describeMetadata(metadata: unknown): { field: string; value: string }[] {
  return [...flattenSnapshot(metadata).entries()]
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([field, value]) => ({ field, value }))
}

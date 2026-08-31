/**
 * Formatting for the college's human-readable identifiers.
 *
 * Pure and dependency-free, so the browser, the server and the tests can all
 * use it. Allocating the next number is a database operation and lives in
 * src/server/services/code-sequence.ts.
 */

/**
 * `formatCode('STU-', 7, 4)` → `'STU-0007'`
 *
 * If the counter ever grows past the padding the number simply gets longer —
 * it is never truncated, because a truncated identifier would collide with
 * another student's.
 */
export function formatCode(prefix: string, value: number, padding: number): string {
  return `${prefix}${String(value).padStart(padding, '0')}`
}

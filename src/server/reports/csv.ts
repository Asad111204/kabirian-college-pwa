/**
 * CSV, written by hand.
 *
 * A report export is the on-screen rows in a file, nothing more, so there is
 * no library to add: RFC 4180 is a page long. Three details matter and each
 * has a test:
 *
 *   - a field is quoted when it contains a comma, a quote, a newline or a
 *     leading/trailing space, and a quote inside it is doubled;
 *   - rows end in CRLF, which every spreadsheet on the college's machines
 *     understands;
 *   - the file starts with a UTF-8 byte-order mark, because without it Excel
 *     on Windows reads Urdu names as mojibake.
 *
 * A cell that starts with `=`, `+`, `-` or `@` is prefixed with a quote so a
 * spreadsheet does not run it as a formula. That is a student's name, not code.
 */

export interface CsvColumn<Row> {
  header: string
  value: (row: Row) => string | number | null | undefined | boolean
}

const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/
const FORMULA_LEAD = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  if (FORMULA_LEAD.test(text)) text = `'${text}`
  if (NEEDS_QUOTING.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function csvLine(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',')
}

/** The whole file, BOM and all. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [csvLine(columns.map((c) => c.header))]
  for (const row of rows) lines.push(csvLine(columns.map((c) => c.value(row))))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** A safe download name: `students-2026-27-1st-year.csv`. */
export function csvFileName(parts: readonly (string | null | undefined)[]): string {
  const slug = parts
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'report'}.csv`
}

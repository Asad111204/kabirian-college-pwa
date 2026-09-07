import { describe, expect, it } from 'vitest'
import { csvCell, csvFileName, csvLine, toCsv } from '@/server/reports/csv'

/**
 * The hand-written CSV. Each rule RFC 4180 needs, and the two spreadsheets
 * need on top, has a test: the export is the on-screen rows in a file, and a
 * file Excel misreads is worse than no file.
 */

describe('a cell', () => {
  it('is written as-is when it is plain', () => {
    expect(csvCell('Ali Raza')).toBe('Ali Raza')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(87.5)).toBe('87.5')
  })

  it('is empty for null and undefined, not the word "null"', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('says Yes or No for a boolean', () => {
    expect(csvCell(true)).toBe('Yes')
    expect(csvCell(false)).toBe('No')
  })

  it('is quoted when it holds a comma, a quote or a line break', () => {
    expect(csvCell('Khan, Ali')).toBe('"Khan, Ali"')
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  it('is quoted when it starts or ends with a space, so the space survives', () => {
    expect(csvCell(' padded')).toBe('" padded"')
  })

  it('cannot become a formula in a spreadsheet', () => {
    // A name is a name. Excel would otherwise evaluate these.
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvCell('+923001234567')).toBe("'+923001234567")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@everyone')).toBe("'@everyone")
  })

  it('keeps Urdu text intact', () => {
    expect(csvCell('علی رضا')).toBe('علی رضا')
  })
})

describe('a file', () => {
  const rows = [
    { code: 'STU-0001', name: 'Ali Raza', pct: 92.5 },
    { code: 'STU-0002', name: 'Khan, Bilal', pct: null },
  ]
  const columns = [
    { header: 'Code', value: (r: (typeof rows)[number]) => r.code },
    { header: 'Name', value: (r: (typeof rows)[number]) => r.name },
    { header: 'Attendance %', value: (r: (typeof rows)[number]) => r.pct },
  ]

  it('starts with the UTF-8 byte-order mark Excel needs', () => {
    expect(toCsv(rows, columns).charCodeAt(0)).toBe(0xfeff)
  })

  it('has a header line, one line per row, CRLF endings, and a final newline', () => {
    const text = toCsv(rows, columns).slice(1)
    expect(text).toBe('Code,Name,Attendance %\r\nSTU-0001,Ali Raza,92.5\r\nSTU-0002,"Khan, Bilal",\r\n')
  })

  it('writes just the header for no rows', () => {
    expect(toCsv([], columns).slice(1)).toBe('Code,Name,Attendance %\r\n')
  })

  it('joins cells with commas and nothing else', () => {
    expect(csvLine(['a', 1, null])).toBe('a,1,')
  })
})

describe('a file name', () => {
  it('is a lower-case slug with the parts that exist', () => {
    expect(csvFileName(['Students', '2026-27', '1st Year', null, 'Pre-Medical'])).toBe(
      'students-2026-27-1st-year-pre-medical.csv',
    )
  })

  it('never comes out empty', () => {
    expect(csvFileName([null, ''])).toBe('report.csv')
  })
})

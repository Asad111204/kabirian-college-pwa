import { describe, expect, it } from 'vitest'
import { normaliseHeader, parseCsv } from '@/lib/csv-read'
import { toCsv } from '@/server/reports/csv'

/** The CSV reader the student import uses — and its round trip with our own writer. */
describe('parseCsv', () => {
  it('reads plain rows, CRLF or LF', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles quoted cells with commas, newlines and doubled quotes', () => {
    expect(parseCsv('name,note\n"Khan, Ali","said ""hello""\nthen left"')).toEqual([
      ['name', 'note'],
      ['Khan, Ali', 'said "hello"\nthen left'],
    ])
  })

  it('drops the byte-order mark Excel writes and blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n   \n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads back what the report writer produces, formula guard included', () => {
    const text = toCsv([{ name: '=cmd()', city: 'Lahore, Punjab' }], [
      { header: 'Name', value: (r) => r.name },
      { header: 'City', value: (r) => r.city },
    ])
    const rows = parseCsv(text)
    expect(rows[0]).toEqual(['Name', 'City'])
    expect(rows[1]![0]).toBe("'=cmd()") // the guard survives the round trip, as it should
    expect(rows[1]![1]).toBe('Lahore, Punjab')
  })
})

describe('normaliseHeader', () => {
  it('turns a spreadsheet heading into the column name the import expects', () => {
    expect(normaliseHeader(' Full Name ')).toBe('full_name')
    expect(normaliseHeader("Father's CNIC")).toBe('father_s_cnic')
    expect(normaliseHeader('CLASS')).toBe('class')
  })
})

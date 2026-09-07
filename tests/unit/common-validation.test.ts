import { describe, expect, it } from 'vitest'
import { cnic, entityCode, isoDate, listQuerySchema, optionalText, phone, requiredText, sessionName, uuid } from '@/validation/common'

/** The building blocks every form schema is made of. */
describe('the shared validators', () => {
  it('uuid accepts an identifier and refuses anything else', () => {
    expect(uuid.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true)
    expect(uuid.safeParse('1').success).toBe(false)
    expect(uuid.safeParse("' OR 1=1").success).toBe(false)
  })

  it('cnic wants 12345-1234567-1 exactly, trimmed', () => {
    expect(cnic.parse(' 12345-1234567-1 ')).toBe('12345-1234567-1')
    expect(cnic.safeParse('1234512345671').success).toBe(false)
    expect(cnic.safeParse('12345-123456-1').success).toBe(false)
  })

  it('phone accepts a Pakistani mobile in either form', () => {
    expect(phone.safeParse('0300-1234567').success).toBe(true)
    expect(phone.safeParse('03001234567').success).toBe(true)
    expect(phone.safeParse('+923001234567').success).toBe(true)
    expect(phone.safeParse('1234').success).toBe(false)
  })

  it('isoDate and sessionName take the formats the forms send', () => {
    expect(isoDate.safeParse('2026-08-01').success).toBe(true)
    expect(isoDate.safeParse('1 Aug 2026').success).toBe(false)
    expect(sessionName.safeParse('2026-27').success).toBe(true)
    expect(sessionName.safeParse('2026-2027').success).toBe(false)
  })

  it('optionalText turns an empty field into nothing and caps the length', () => {
    const schema = optionalText(10)
    expect(schema.parse('')).toBeUndefined()
    expect(schema.parse('  hello ')).toBe('hello')
    expect(schema.safeParse('x'.repeat(11)).success).toBe(false)
  })

  it('requiredText names the field in its message', () => {
    const result = requiredText(50, 'Full name').safeParse('   ')
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toMatch(/Full name/)
  })

  it('entityCode is upper-case letters, digits and dashes', () => {
    expect(entityCode(10).parse('pm-1')).toBe('PM-1')
    expect(entityCode(10).safeParse('has space').success).toBe(false)
  })

  it('listQuerySchema pages sensibly and reads includeInactive from a form', () => {
    const parsed = listQuerySchema.parse({ page: '2', pageSize: '50', includeInactive: 'true' })
    expect(parsed.page).toBe(2)
    expect(parsed.pageSize).toBe(50)
    expect(parsed.includeInactive).toBe(true)
    expect(listQuerySchema.parse({}).includeInactive).toBe(false)
    expect(listQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false)
  })
})

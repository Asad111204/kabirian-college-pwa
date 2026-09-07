import { describe, expect, it } from 'vitest'
import {
  REPORT_GROUPINGS,
  REPORT_GROUPING_LABEL,
  attendanceReportExportSchema,
  examReportQuerySchema,
  missingDocumentsQuerySchema,
  resultReportQuerySchema,
  staffReportQuerySchema,
  studentReportQuerySchema,
} from '@/validation/reports'

/**
 * The report filters, checked with the same schemas the routes use. The point
 * that matters: `format` is the only thing that separates the screen from the
 * file, so one query serves both.
 */

const UUID = '11111111-1111-4111-8111-111111111111'

describe('the scope of a report', () => {
  it('defaults to the whole college, ungrouped, as JSON', () => {
    const parsed = studentReportQuerySchema.parse({})
    expect(parsed.groupBy).toBe('none')
    expect(parsed.format).toBe('json')
    expect(parsed.status).toBe('ACTIVE')
    expect(parsed.classId).toBeUndefined()
  })

  it('treats an empty select as no filter, the way a form sends it', () => {
    const parsed = studentReportQuerySchema.parse({ classId: '', sectionId: '', academicSessionId: '' })
    expect(parsed.classId).toBeUndefined()
    expect(parsed.sectionId).toBeUndefined()
  })

  it('accepts every level of the structure as a filter and as a grouping', () => {
    const parsed = studentReportQuerySchema.parse({
      academicSessionId: UUID,
      classId: UUID,
      divisionId: UUID,
      programId: UUID,
      academicGroupId: UUID,
      sectionId: UUID,
      groupBy: 'section',
      format: 'csv',
    })
    expect(parsed.sectionId).toBe(UUID)
    expect(parsed.groupBy).toBe('section')
    expect(parsed.format).toBe('csv')
    expect([...REPORT_GROUPINGS]).toEqual(['none', 'class', 'division', 'program', 'group', 'section'])
    for (const g of REPORT_GROUPINGS) expect(REPORT_GROUPING_LABEL[g]).toBeTruthy()
  })

  it('refuses an id that is not an identifier, a grouping it does not know, and a format it cannot write', () => {
    expect(studentReportQuerySchema.safeParse({ classId: 'first-year' }).success).toBe(false)
    expect(studentReportQuerySchema.safeParse({ groupBy: 'teacher' }).success).toBe(false)
    expect(studentReportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false)
  })
})

describe('the staff report', () => {
  it('groups by department, designation or type', () => {
    expect(staffReportQuerySchema.parse({ groupBy: 'department' }).groupBy).toBe('department')
    expect(staffReportQuerySchema.safeParse({ groupBy: 'section' }).success).toBe(false)
  })

  it('defaults to active staff of every type', () => {
    const parsed = staffReportQuerySchema.parse({})
    expect(parsed.status).toBe('ACTIVE')
    expect(parsed.staffType).toBe('ALL')
  })
})

describe('missing documents', () => {
  it('may be narrowed to one document type', () => {
    expect(missingDocumentsQuerySchema.parse({ documentTypeKey: 'STUDENT_PHOTO' }).documentTypeKey).toBe('STUDENT_PHOTO')
    expect(missingDocumentsQuerySchema.parse({ documentTypeKey: '' }).documentTypeKey).toBeUndefined()
  })
})

describe('exam and result reports', () => {
  it('are for one exam, which is required', () => {
    expect(examReportQuerySchema.safeParse({}).success).toBe(false)
    expect(examReportQuerySchema.parse({ examId: UUID }).format).toBe('json')
    expect(resultReportQuerySchema.safeParse({}).success).toBe(false)
  })

  it('results may be narrowed and grouped within the exam', () => {
    const parsed = resultReportQuerySchema.parse({ examId: UUID, outcome: 'PASS', status: 'PUBLISHED', groupBy: 'program' })
    expect(parsed.outcome).toBe('PASS')
    expect(parsed.groupBy).toBe('program')
    expect(resultReportQuerySchema.safeParse({ examId: UUID, groupBy: 'division' }).success).toBe(false)
  })
})

describe('the attendance export', () => {
  it('takes the same filters as the attendance report screen', () => {
    const parsed = attendanceReportExportSchema.parse({ dateFrom: '2026-09-01', dateTo: '2026-09-30', kind: 'subject', format: 'csv' })
    expect(parsed.dateFrom).toBe('2026-09-01')
    expect(parsed.kind).toBe('subject')
    expect(parsed.format).toBe('csv')
  })

  it('refuses a date that is not a date', () => {
    expect(attendanceReportExportSchema.safeParse({ dateFrom: '1 Sept' }).success).toBe(false)
  })
})

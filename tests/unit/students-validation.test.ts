import { describe, expect, it } from 'vitest'
import {
  enrollmentSelectionSchema,
  studentAccountSchema,
  studentCreateSchema,
  studentListQuerySchema,
  studentPromoteSchema,
  studentStatusSchema,
  studentTransferSchema,
  studentUpdateSchema,
  STUDENT_STATUSES,
  STUDENT_STATUS_LABEL,
} from '@/validation/students'
import { formatCode } from '@/lib/codes'

const SESSION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0001'
const CLASS = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0002'
const DIVISION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0003'
const PROGRAM = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0004'
const SECTION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0005'
const USER = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0006'

const validEnrollment = {
  academicSessionId: SESSION,
  classId: CLASS,
  divisionId: DIVISION,
  programId: PROGRAM,
  sectionId: SECTION,
}

const minimalStudent = {
  fullName: 'Muhammad Ali',
  fatherName: 'Ahmed Khan',
  admissionDate: '2026-08-15',
  enrollment: validEnrollment,
}

/* -------------------------------------------------------------------------- */
/* Creating a student                                                         */
/* -------------------------------------------------------------------------- */

describe('creating a student', () => {
  it('accepts a student with only the required fields', () => {
    expect(studentCreateSchema.safeParse(minimalStudent).success).toBe(true)
  })

  it('requires a name, a father name and an admission date', () => {
    expect(studentCreateSchema.safeParse({ ...minimalStudent, fullName: '' }).success).toBe(false)
    expect(studentCreateSchema.safeParse({ ...minimalStudent, fatherName: '' }).success).toBe(false)
    expect(studentCreateSchema.safeParse({ ...minimalStudent, admissionDate: '' }).success).toBe(false)
  })

  it('never accepts a student ID from the browser — the server assigns it', () => {
    const result = studentCreateSchema.parse({
      ...minimalStudent,
      studentCode: 'STU-9999',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('studentCode')
  })

  it('lets the admission number be left blank so the counter supplies one', () => {
    expect(studentCreateSchema.parse({ ...minimalStudent, admissionNumber: '' }).admissionNumber).toBeUndefined()
    expect(studentCreateSchema.parse({ ...minimalStudent, admissionNumber: 'ADM-2026-1' }).admissionNumber).toBe(
      'ADM-2026-1',
    )
  })

  it('validates a CNIC / B-Form number when one is given', () => {
    expect(studentCreateSchema.safeParse({ ...minimalStudent, cnicBformNumber: '12345-1234567-1' }).success).toBe(true)
    expect(studentCreateSchema.safeParse({ ...minimalStudent, cnicBformNumber: '1234512345671' }).success).toBe(false)
    // Blank means "not recorded", not an error.
    expect(studentCreateSchema.parse({ ...minimalStudent, cnicBformNumber: '' }).cnicBformNumber).toBeUndefined()
  })

  it('validates a phone number when one is given', () => {
    expect(studentCreateSchema.safeParse({ ...minimalStudent, fatherPhone: '0300-1234567' }).success).toBe(true)
    expect(studentCreateSchema.safeParse({ ...minimalStudent, fatherPhone: '+923001234567' }).success).toBe(true)
    expect(studentCreateSchema.safeParse({ ...minimalStudent, fatherPhone: '123' }).success).toBe(false)
  })

  it('refuses marks obtained greater than the total', () => {
    const result = studentCreateSchema.safeParse({
      ...minimalStudent,
      previousResultObtained: 1200,
      previousResultTotal: 1100,
    })
    expect(result.success).toBe(false)
  })

  it('accepts marks that are within the total', () => {
    expect(
      studentCreateSchema.safeParse({
        ...minimalStudent,
        previousResultObtained: 950,
        previousResultTotal: 1100,
      }).success,
    ).toBe(true)
  })

  it('requires a username when a portal account is requested', () => {
    expect(studentCreateSchema.safeParse({ ...minimalStudent, createAccount: true }).success).toBe(false)
    expect(
      studentCreateSchema.safeParse({ ...minimalStudent, createAccount: true, username: 'muhammad.ali' }).success,
    ).toBe(true)
  })

  it('rejects a username with spaces', () => {
    expect(
      studentCreateSchema.safeParse({ ...minimalStudent, createAccount: true, username: 'muhammad ali' }).success,
    ).toBe(false)
  })

  it('does not create an account unless explicitly asked', () => {
    expect(studentCreateSchema.parse(minimalStudent).createAccount).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Enrollment selection                                                       */
/* -------------------------------------------------------------------------- */

describe('enrollment selection', () => {
  it('needs the whole chain: session, class, division, program and section', () => {
    for (const missing of ['academicSessionId', 'classId', 'divisionId', 'programId', 'sectionId']) {
      const partial: Record<string, unknown> = { ...validEnrollment }
      delete partial[missing]
      expect(enrollmentSelectionSchema.safeParse(partial).success, `${missing} is required`).toBe(false)
    }
  })

  it('identifies every level by id, so new programs need no code change', () => {
    // A program created moments ago is just another uuid here.
    const brandNewProgram = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7dffff'
    expect(
      enrollmentSelectionSchema.safeParse({ ...validEnrollment, programId: brandNewProgram }).success,
    ).toBe(true)
  })

  it('rejects a name instead of an id', () => {
    expect(enrollmentSelectionSchema.safeParse({ ...validEnrollment, programId: 'Pre-Medical' }).success).toBe(false)
  })

  it('treats a blank roll number as "not set"', () => {
    expect(enrollmentSelectionSchema.parse({ ...validEnrollment, rollNumber: '' }).rollNumber).toBeUndefined()
  })

  it('accepts a normal roll number and rejects odd characters', () => {
    expect(enrollmentSelectionSchema.parse({ ...validEnrollment, rollNumber: '101' }).rollNumber).toBe('101')
    expect(enrollmentSelectionSchema.safeParse({ ...validEnrollment, rollNumber: '10 1' }).success).toBe(false)
    expect(enrollmentSelectionSchema.safeParse({ ...validEnrollment, rollNumber: '10/1' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Moving a student                                                           */
/* -------------------------------------------------------------------------- */

describe('transfer and promotion', () => {
  it('accepts a transfer with a reason', () => {
    expect(
      studentTransferSchema.safeParse({ enrollment: validEnrollment, reason: 'Changed program' }).success,
    ).toBe(true)
  })

  it('defaults a promotion outcome to PROMOTED', () => {
    expect(studentPromoteSchema.parse({ enrollment: validEnrollment }).outcome).toBe('PROMOTED')
  })

  it('allows repeating a year or completing the final year', () => {
    expect(studentPromoteSchema.safeParse({ enrollment: validEnrollment, outcome: 'REPEATED' }).success).toBe(true)
    expect(studentPromoteSchema.safeParse({ enrollment: validEnrollment, outcome: 'COMPLETED' }).success).toBe(true)
  })

  it('rejects an invented outcome', () => {
    expect(studentPromoteSchema.safeParse({ enrollment: validEnrollment, outcome: 'EXPELLED' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

describe('student status', () => {
  it('accepts every status the college uses', () => {
    for (const status of STUDENT_STATUSES) {
      expect(studentStatusSchema.safeParse({ status }).success, status).toBe(true)
    }
  })

  it('rejects a made-up status', () => {
    expect(studentStatusSchema.safeParse({ status: 'DELETED' }).success).toBe(false)
    expect(studentStatusSchema.safeParse({ status: 'EXPELLED' }).success).toBe(false)
  })

  it('gives every status a readable label', () => {
    for (const status of STUDENT_STATUSES) {
      expect(STUDENT_STATUS_LABEL[status], status).toBeTruthy()
    }
  })

  it('has no "delete" status — records are kept', () => {
    expect(STUDENT_STATUSES).not.toContain('DELETED')
    expect(STUDENT_STATUSES).toContain('LEFT')
    expect(STUDENT_STATUSES).toContain('GRADUATED')
  })
})

/* -------------------------------------------------------------------------- */
/* Portal account linking                                                     */
/* -------------------------------------------------------------------------- */

describe('linking a portal account', () => {
  it('accepts linking an existing account', () => {
    expect(studentAccountSchema.safeParse({ userId: USER }).success).toBe(true)
  })

  it('accepts creating a new account from a username', () => {
    expect(studentAccountSchema.safeParse({ username: 'muhammad.ali' }).success).toBe(true)
  })

  it('refuses both at once — that would be ambiguous', () => {
    expect(studentAccountSchema.safeParse({ userId: USER, username: 'muhammad.ali' }).success).toBe(false)
  })

  it('refuses neither', () => {
    expect(studentAccountSchema.safeParse({}).success).toBe(false)
  })

  it('lowercases the username so logins stay case-insensitive', () => {
    expect(studentAccountSchema.parse({ username: 'Muhammad.ALI' }).username).toBe('muhammad.ali')
  })

  it('never accepts a password — one is always generated', () => {
    const result = studentAccountSchema.parse({
      username: 'someone',
      password: 'chosen-by-attacker',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('password')
  })
})

/* -------------------------------------------------------------------------- */
/* Updating                                                                   */
/* -------------------------------------------------------------------------- */

describe('updating a student', () => {
  it('requires the admission number to stay set', () => {
    expect(
      studentUpdateSchema.safeParse({
        fullName: 'Muhammad Ali',
        fatherName: 'Ahmed Khan',
        admissionDate: '2026-08-15',
        admissionNumber: '',
      }).success,
    ).toBe(false)
  })

  it('does not allow the enrollment to be changed here', () => {
    const result = studentUpdateSchema.parse({
      fullName: 'Muhammad Ali',
      fatherName: 'Ahmed Khan',
      admissionDate: '2026-08-15',
      admissionNumber: 'ADM-00001',
      enrollment: validEnrollment,
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('enrollment')
  })

  it('does not allow the status to be changed here', () => {
    const result = studentUpdateSchema.parse({
      fullName: 'Muhammad Ali',
      fatherName: 'Ahmed Khan',
      admissionDate: '2026-08-15',
      admissionNumber: 'ADM-00001',
      status: 'GRADUATED',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('status')
  })
})

/* -------------------------------------------------------------------------- */
/* List query                                                                 */
/* -------------------------------------------------------------------------- */

describe('student list query', () => {
  it('shows active students by default', () => {
    const result = studentListQuerySchema.parse({})
    expect(result.status).toBe('ACTIVE')
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(25)
    expect(result.sort).toBe('fullName')
  })

  it('caps the page size so nobody can request every student at once', () => {
    expect(studentListQuerySchema.safeParse({ pageSize: 100000 }).success).toBe(false)
    expect(studentListQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50)
  })

  it('only allows sorting by known columns', () => {
    expect(studentListQuerySchema.safeParse({ sort: 'cnicBformNumber' }).success).toBe(false)
    expect(studentListQuerySchema.safeParse({ sort: 'fatherCnic' }).success).toBe(false)
    expect(studentListQuerySchema.safeParse({ sort: 'admissionNumber' }).success).toBe(true)
  })

  it('accepts every academic filter as an id', () => {
    const result = studentListQuerySchema.parse({
      sessionId: SESSION,
      classId: CLASS,
      divisionId: DIVISION,
      programId: PROGRAM,
      sectionId: SECTION,
    })
    expect(result.programId).toBe(PROGRAM)
    expect(result.sectionId).toBe(SECTION)
  })

  it('treats an empty filter as "not filtered"', () => {
    const result = studentListQuerySchema.parse({ programId: '', sectionId: '' })
    expect(result.programId).toBeUndefined()
    expect(result.sectionId).toBeUndefined()
  })

  it('rejects a filter that is not an id', () => {
    expect(studentListQuerySchema.safeParse({ programId: 'Pre-Medical' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Identifier formatting                                                      */
/* -------------------------------------------------------------------------- */

describe('student identifiers', () => {
  it('pads the counter to a fixed width', () => {
    expect(formatCode('STU-', 1, 4)).toBe('STU-0001')
    expect(formatCode('STU-', 42, 4)).toBe('STU-0042')
    expect(formatCode('ADM-', 7, 5)).toBe('ADM-00007')
  })

  it('keeps growing past the padding rather than truncating', () => {
    expect(formatCode('STU-', 12345, 4)).toBe('STU-12345')
  })

  it('uses whatever prefix the college configured', () => {
    expect(formatCode('KC/', 9, 3)).toBe('KC/009')
  })
})

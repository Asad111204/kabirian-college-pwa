import { describe, expect, it } from 'vitest'
import {
  assignmentCreateSchema,
  departmentCreateSchema,
  designationCreateSchema,
  EMPLOYED_STATUSES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_STATUS_LABEL,
  inchargeAssignSchema,
  staffAccountSchema,
  staffCreateSchema,
  staffListQuerySchema,
  staffStatusSchema,
  staffUpdateSchema,
  STAFF_TYPES,
  STAFF_TYPE_LABEL,
} from '@/validation/staff'

const SESSION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0001'
const CLASS = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0002'
const DIVISION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0003'
const PROGRAM = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0004'
const SECTION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0005'
const SUBJECT = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0006'
const DESIGNATION = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0007'
const DEPARTMENT = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0008'
const USER = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7d0009'

const minimalStaff = {
  fullName: 'Muhammad Ahmed',
  designationId: DESIGNATION,
  staffType: 'TEACHING',
  joiningDate: '2020-03-01',
}

/* -------------------------------------------------------------------------- */
/* Creating staff                                                             */
/* -------------------------------------------------------------------------- */

describe('creating a staff member', () => {
  it('accepts the minimum required fields', () => {
    expect(staffCreateSchema.safeParse(minimalStaff).success).toBe(true)
  })

  it('requires a name, designation, staff type and joining date', () => {
    for (const missing of ['fullName', 'designationId', 'staffType', 'joiningDate']) {
      const partial: Record<string, unknown> = { ...minimalStaff }
      delete partial[missing]
      expect(staffCreateSchema.safeParse(partial).success, `${missing} is required`).toBe(false)
    }
  })

  it('never accepts a staff ID from the browser — the server assigns it', () => {
    const result = staffCreateSchema.parse({ ...minimalStaff, staffCode: 'STF-9999' } as Record<string, unknown>)
    expect(result).not.toHaveProperty('staffCode')
  })

  it('identifies designation and department by id, so new ones need no code change', () => {
    const brandNewDesignation = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7dffff'
    expect(
      staffCreateSchema.safeParse({ ...minimalStaff, designationId: brandNewDesignation }).success,
    ).toBe(true)
  })

  it('rejects a designation given as a name instead of an id', () => {
    expect(staffCreateSchema.safeParse({ ...minimalStaff, designationId: 'Lecturer' }).success).toBe(false)
  })

  it('treats a blank department as "no department"', () => {
    expect(staffCreateSchema.parse({ ...minimalStaff, departmentId: '' }).departmentId).toBeUndefined()
    expect(staffCreateSchema.parse({ ...minimalStaff, departmentId: DEPARTMENT }).departmentId).toBe(DEPARTMENT)
  })

  it('validates a CNIC when one is given', () => {
    expect(staffCreateSchema.safeParse({ ...minimalStaff, cnicNumber: '35201-1234567-1' }).success).toBe(true)
    expect(staffCreateSchema.safeParse({ ...minimalStaff, cnicNumber: '3520112345671' }).success).toBe(false)
    expect(staffCreateSchema.parse({ ...minimalStaff, cnicNumber: '' }).cnicNumber).toBeUndefined()
  })

  it('validates a phone number when one is given', () => {
    expect(staffCreateSchema.safeParse({ ...minimalStaff, phone: '0300-1234567' }).success).toBe(true)
    expect(staffCreateSchema.safeParse({ ...minimalStaff, phone: '12345' }).success).toBe(false)
  })

  it('rejects an invented staff type', () => {
    expect(staffCreateSchema.safeParse({ ...minimalStaff, staffType: 'PRINCIPAL' }).success).toBe(false)
    // The deprecated value is not offered either.
    expect(staffCreateSchema.safeParse({ ...minimalStaff, staffType: 'NON_TEACHING' }).success).toBe(false)
  })

  it('requires a username when a portal account is requested', () => {
    expect(staffCreateSchema.safeParse({ ...minimalStaff, createAccount: true }).success).toBe(false)
    expect(
      staffCreateSchema.safeParse({ ...minimalStaff, createAccount: true, username: 'm.ahmed' }).success,
    ).toBe(true)
  })

  it('does not create an account unless explicitly asked', () => {
    expect(staffCreateSchema.parse(minimalStaff).createAccount).toBe(false)
  })

  it('never accepts a password — one is always generated', () => {
    const result = staffCreateSchema.parse({
      ...minimalStaff,
      password: 'attacker-chosen',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('password')
  })
})

describe('updating a staff member', () => {
  it('does not allow the employment status to be changed here', () => {
    const result = staffUpdateSchema.parse({
      ...minimalStaff,
      employmentStatus: 'RESIGNED',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('employmentStatus')
  })

  it('does not allow an account to be created here', () => {
    const result = staffUpdateSchema.parse({
      ...minimalStaff,
      createAccount: true,
      username: 'sneaky',
    } as Record<string, unknown>)
    expect(result).not.toHaveProperty('createAccount')
    expect(result).not.toHaveProperty('username')
  })
})

/* -------------------------------------------------------------------------- */
/* Employment status                                                          */
/* -------------------------------------------------------------------------- */

describe('employment status', () => {
  it('accepts every status the college uses', () => {
    for (const status of EMPLOYMENT_STATUSES) {
      expect(staffStatusSchema.safeParse({ employmentStatus: status }).success, status).toBe(true)
    }
  })

  it('covers the lifecycle the requirement asks for', () => {
    for (const expected of ['ACTIVE', 'INACTIVE', 'RESIGNED', 'RETIRED', 'TERMINATED']) {
      expect(EMPLOYMENT_STATUSES).toContain(expected)
    }
  })

  it('rejects a made-up status', () => {
    expect(staffStatusSchema.safeParse({ employmentStatus: 'FIRED' }).success).toBe(false)
    expect(staffStatusSchema.safeParse({ employmentStatus: 'DELETED' }).success).toBe(false)
  })

  it('has no "delete" status — records are kept', () => {
    expect(EMPLOYMENT_STATUSES).not.toContain('DELETED')
  })

  it('treats only Active and On leave as still employed', () => {
    expect([...EMPLOYED_STATUSES]).toEqual(['ACTIVE', 'ON_LEAVE'])
    for (const status of EMPLOYMENT_STATUSES) {
      const stillHere = (EMPLOYED_STATUSES as readonly string[]).includes(status)
      if (['RESIGNED', 'RETIRED', 'TERMINATED', 'INACTIVE'].includes(status)) {
        expect(stillHere, `${status} should end assignments`).toBe(false)
      }
    }
  })

  it('gives every status and staff type a readable label', () => {
    for (const status of EMPLOYMENT_STATUSES) expect(EMPLOYMENT_STATUS_LABEL[status]).toBeTruthy()
    for (const type of STAFF_TYPES) expect(STAFF_TYPE_LABEL[type]).toBeTruthy()
    // The deprecated values still display rather than showing a blank.
    expect(EMPLOYMENT_STATUS_LABEL.LEFT).toBeTruthy()
    expect(STAFF_TYPE_LABEL.NON_TEACHING).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */
/* Teacher assignments                                                        */
/* -------------------------------------------------------------------------- */

const validAssignment = {
  academicSessionId: SESSION,
  classId: CLASS,
  divisionId: DIVISION,
  programId: PROGRAM,
  sectionId: SECTION,
  subjectId: SUBJECT,
}

describe('teacher assignment', () => {
  it('accepts the full academic chain plus a subject', () => {
    expect(assignmentCreateSchema.safeParse(validAssignment).success).toBe(true)
  })

  it('needs every level of the chain', () => {
    for (const missing of ['academicSessionId', 'classId', 'divisionId', 'programId', 'sectionId', 'subjectId']) {
      const partial: Record<string, unknown> = { ...validAssignment }
      delete partial[missing]
      expect(assignmentCreateSchema.safeParse(partial).success, `${missing} is required`).toBe(false)
    }
  })

  it('identifies everything by id, so a new program or subject just works', () => {
    const brandNew = '018f4d3e-9a1b-7c2d-8e3f-4a5b6c7deeee'
    expect(
      assignmentCreateSchema.safeParse({ ...validAssignment, programId: brandNew, subjectId: brandNew })
        .success,
    ).toBe(true)
  })

  it('rejects names instead of ids', () => {
    expect(assignmentCreateSchema.safeParse({ ...validAssignment, subjectId: 'Biology' }).success).toBe(false)
    expect(assignmentCreateSchema.safeParse({ ...validAssignment, programId: 'Pre-Medical' }).success).toBe(false)
  })
})

describe('section in-charge', () => {
  it('needs the academic chain but no subject', () => {
    const { subjectId, ...withoutSubject } = validAssignment
    void subjectId
    expect(inchargeAssignSchema.safeParse(withoutSubject).success).toBe(true)
  })

  it('still needs the section', () => {
    const { subjectId, sectionId, ...partial } = validAssignment
    void subjectId
    void sectionId
    expect(inchargeAssignSchema.safeParse(partial).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Account linking                                                            */
/* -------------------------------------------------------------------------- */

describe('linking a staff portal account', () => {
  it('accepts linking an existing account', () => {
    expect(staffAccountSchema.safeParse({ userId: USER }).success).toBe(true)
  })

  it('accepts creating a new one from a username', () => {
    expect(staffAccountSchema.safeParse({ username: 'm.ahmed' }).success).toBe(true)
  })

  it('refuses both at once, and neither', () => {
    expect(staffAccountSchema.safeParse({ userId: USER, username: 'm.ahmed' }).success).toBe(false)
    expect(staffAccountSchema.safeParse({}).success).toBe(false)
  })

  it('lowercases the username so logins stay case-insensitive', () => {
    expect(staffAccountSchema.parse({ username: 'M.Ahmed' }).username).toBe('m.ahmed')
  })

  it('never accepts a password', () => {
    const result = staffAccountSchema.parse({ username: 'someone', password: 'x' } as Record<string, unknown>)
    expect(result).not.toHaveProperty('password')
  })
})

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */

describe('designations and departments', () => {
  it('accepts a new designation the college invents', () => {
    expect(
      designationCreateSchema.safeParse({ name: 'Senior Lecturer', code: 'SR-LECT' }).success,
    ).toBe(true)
  })

  it('upper-cases the code and treats a blank one as none', () => {
    expect(designationCreateSchema.parse({ name: 'X', code: 'abc' }).code).toBe('ABC')
    expect(designationCreateSchema.parse({ name: 'X', code: '' }).code).toBeUndefined()
  })

  it('defaults a designation to teaching and active', () => {
    const result = designationCreateSchema.parse({ name: 'X' })
    expect(result.isTeaching).toBe(true)
    expect(result.isActive).toBe(true)
  })

  it('accepts a new department', () => {
    expect(departmentCreateSchema.safeParse({ name: 'Statistics', code: 'STAT' }).success).toBe(true)
  })

  it('requires a name for both', () => {
    expect(designationCreateSchema.safeParse({ name: '' }).success).toBe(false)
    expect(departmentCreateSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects codes with spaces or symbols', () => {
    expect(designationCreateSchema.safeParse({ name: 'X', code: 'SR LECT' }).success).toBe(false)
    expect(departmentCreateSchema.safeParse({ name: 'X', code: 'C.S' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* List query                                                                 */
/* -------------------------------------------------------------------------- */

describe('staff list query', () => {
  it('shows active staff by default', () => {
    const result = staffListQuerySchema.parse({})
    expect(result.status).toBe('ACTIVE')
    expect(result.page).toBe(1)
    expect(result.sort).toBe('fullName')
    expect(result.account).toBe('ALL')
  })

  it('caps the page size so nobody can request every record at once', () => {
    expect(staffListQuerySchema.safeParse({ pageSize: 10000 }).success).toBe(false)
    expect(staffListQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50)
  })

  it('only allows sorting by known columns', () => {
    expect(staffListQuerySchema.safeParse({ sort: 'cnicNumber' }).success).toBe(false)
    expect(staffListQuerySchema.safeParse({ sort: 'staffCode' }).success).toBe(true)
  })

  it('filters by department and designation as ids', () => {
    const result = staffListQuerySchema.parse({ departmentId: DEPARTMENT, designationId: DESIGNATION })
    expect(result.departmentId).toBe(DEPARTMENT)
    expect(result.designationId).toBe(DESIGNATION)
  })

  it('can filter by whether an account is linked', () => {
    expect(staffListQuerySchema.parse({ account: 'LINKED' }).account).toBe('LINKED')
    expect(staffListQuerySchema.parse({ account: 'NONE' }).account).toBe('NONE')
    expect(staffListQuerySchema.safeParse({ account: 'MAYBE' }).success).toBe(false)
  })
})

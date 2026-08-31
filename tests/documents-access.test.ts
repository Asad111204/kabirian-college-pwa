import { describe, expect, it } from 'vitest'
import { decideDocumentAccess, type DocumentAccessRequest } from '@/server/documents/access'

/**
 * The document access rules.
 *
 * This is the security core of Phase 6, so each rule is tested from both sides:
 * the case it must allow, and the case it must refuse. A rule with only a
 * happy-path test proves nothing about what it keeps out.
 */

const STUDENT_A = 'student-a'
const STUDENT_B = 'student-b'
const STAFF_A = 'staff-a'
const STAFF_B = 'staff-b'

function request(overrides: {
  viewer?: Partial<DocumentAccessRequest['viewer']>
  document?: Partial<DocumentAccessRequest['document']>
  studentInTeachingScope?: boolean
}): DocumentAccessRequest {
  return {
    viewer: {
      role: 'ADMIN',
      studentId: null,
      staffId: null,
      canViewDocuments: true,
      canViewSensitive: true,
      ...overrides.viewer,
    },
    document: {
      studentId: STUDENT_A,
      staffId: null,
      isSensitive: false,
      ...overrides.document,
    },
    studentInTeachingScope: overrides.studentInTeachingScope ?? false,
  }
}

const admin = { role: 'ADMIN' as const, canViewDocuments: true, canViewSensitive: true }
const teacher = {
  role: 'STAFF' as const,
  staffId: STAFF_A,
  canViewDocuments: true,
  canViewSensitive: false,
}
const student = {
  role: 'STUDENT' as const,
  studentId: STUDENT_A,
  canViewDocuments: true,
  canViewSensitive: false,
}

describe('a person and their own documents', () => {
  it('lets a student open their own photograph', () => {
    const decision = decideDocumentAccess(request({ viewer: student }))
    expect(decision.allowed).toBe(true)
  })

  it('lets a student open their own sensitive B-Form', () => {
    const decision = decideDocumentAccess(
      request({ viewer: student, document: { isSensitive: true } }),
    )
    expect(decision.allowed).toBe(true)
  })

  it('lets a staff member open their own CV even without view_sensitive', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: { ...teacher, staffId: STAFF_A },
        document: { studentId: null, staffId: STAFF_A, isSensitive: true },
      }),
    )
    expect(decision.allowed).toBe(true)
  })

  it('refuses a student another student’s document', () => {
    const decision = decideDocumentAccess(
      request({ viewer: student, document: { studentId: STUDENT_B } }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })

  it('refuses a staff member another staff member’s document', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: { ...teacher, staffId: STAFF_A },
        document: { studentId: null, staffId: STAFF_B, isSensitive: false },
      }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('administrators', () => {
  it('may open any student document', () => {
    expect(decideDocumentAccess(request({ viewer: admin })).allowed).toBe(true)
  })

  it('may open sensitive documents', () => {
    const decision = decideDocumentAccess(
      request({ viewer: admin, document: { isSensitive: true } }),
    )
    expect(decision.allowed).toBe(true)
  })

  it('is refused a sensitive document when view_sensitive has been revoked', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: { ...admin, canViewSensitive: false },
        document: { isSensitive: true },
      }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'SENSITIVE' })
  })

  it('is refused everything when documents.view has been revoked', () => {
    const decision = decideDocumentAccess(
      request({ viewer: { ...admin, canViewDocuments: false } }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

describe('teachers, and the line between a photograph and an identity document', () => {
  it('may open the photograph of a student they teach', () => {
    const decision = decideDocumentAccess(
      request({ viewer: teacher, document: { isSensitive: false }, studentInTeachingScope: true }),
    )
    expect(decision.allowed).toBe(true)
  })

  it('may NOT open the B-Form of a student they teach', () => {
    const decision = decideDocumentAccess(
      request({ viewer: teacher, document: { isSensitive: true }, studentInTeachingScope: true }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'SENSITIVE' })
  })

  it('may not open the photograph of a student they do not teach', () => {
    const decision = decideDocumentAccess(
      request({ viewer: teacher, document: { isSensitive: false }, studentInTeachingScope: false }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'OUT_OF_SCOPE' })
  })

  it('reports out-of-scope before sensitivity, so the message names the real problem', () => {
    const decision = decideDocumentAccess(
      request({ viewer: teacher, document: { isSensitive: true }, studentInTeachingScope: false }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'OUT_OF_SCOPE' })
  })

  it('may open a sensitive document once granted view_sensitive individually', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: { ...teacher, canViewSensitive: true },
        document: { isSensitive: true },
        studentInTeachingScope: true,
      }),
    )
    expect(decision.allowed).toBe(true)
  })

  it('gains nothing from being staff if no staff record is linked', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: { ...teacher, staffId: null },
        document: { isSensitive: false },
        studentInTeachingScope: true,
      }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })

  it('cannot reach a staff document belonging to someone else, even in scope', () => {
    const decision = decideDocumentAccess(
      request({
        viewer: teacher,
        document: { studentId: null, staffId: STAFF_B, isSensitive: false },
        studentInTeachingScope: true,
      }),
    )
    expect(decision).toMatchObject({ allowed: false, code: 'NO_PERMISSION' })
  })
})

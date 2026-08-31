/**
 * Who may open which document.
 *
 * This is the single decision the whole documents feature turns on, so it is
 * written as one pure function with no database and no Drive access. That makes
 * it directly testable: every rule below has a test that proves it, rather than
 * a comment claiming it.
 *
 * The service does the lookups (is this student in the teacher's sections?) and
 * hands the answers here; this function only decides.
 */

export type DocumentAccessDecision =
  | { allowed: true }
  | { allowed: false; code: 'NOT_AUTHENTICATED' | 'NO_PERMISSION' | 'OUT_OF_SCOPE' | 'SENSITIVE'; reason: string }

export interface DocumentAccessRequest {
  /** The person asking. */
  viewer: {
    role: 'ADMIN' | 'STAFF' | 'STUDENT'
    studentId: string | null
    staffId: string | null
    /** True when they hold `documents.view`. */
    canViewDocuments: boolean
    /** True when they hold `documents.view_sensitive`. */
    canViewSensitive: boolean
  }
  /** The document being asked for. */
  document: {
    studentId: string | null
    staffId: string | null
    isSensitive: boolean
  }
  /**
   * Whether the document's student is in this viewer's teaching scope.
   * The caller works this out; `false` for anyone who is not a teacher.
   */
  studentInTeachingScope: boolean
}

const SENSITIVE_REASON =
  'This is an identity document. Teachers can see a student’s photograph, but identity documents are kept to the office.'

export function decideDocumentAccess(request: DocumentAccessRequest): DocumentAccessDecision {
  const { viewer, document, studentInTeachingScope } = request

  /**
   * Rule 1 — your own documents are yours.
   *
   * A student may open their own B-Form and a staff member their own CNIC,
   * sensitive or not. Withholding someone's own identity document from them
   * would be absurd, and they supplied it in the first place.
   */
  const isOwnStudentRecord = document.studentId !== null && viewer.studentId === document.studentId
  const isOwnStaffRecord = document.staffId !== null && viewer.staffId === document.staffId
  if (isOwnStudentRecord || isOwnStaffRecord) return { allowed: true }

  // Everyone else needs the basic permission before anything else is considered.
  if (!viewer.canViewDocuments) {
    return {
      allowed: false,
      code: 'NO_PERMISSION',
      reason: 'You do not have permission to view documents.',
    }
  }

  const sensitiveOk = !document.isSensitive || viewer.canViewSensitive

  /**
   * Rule 2 — an administrator may open anyone's documents, but a sensitive one
   * still needs `documents.view_sensitive`. That permission is on the ADMIN role
   * by default, so this only bites if it has been revoked for someone
   * deliberately — which is exactly when it should bite.
   */
  if (viewer.role === 'ADMIN') {
    return sensitiveOk
      ? { allowed: true }
      : {
          allowed: false,
          code: 'SENSITIVE',
          reason: 'Opening identity documents needs the "view sensitive documents" permission.',
        }
  }

  /**
   * Rule 3 — a teacher, and only for students they actually teach.
   *
   * Two separate gates, and both must open. Being able to see that a student
   * exists is not the same as being able to open their family's identity
   * documents: a class teacher needs the photograph for their register and
   * nothing more. An administrator can grant `documents.view_sensitive` to a
   * particular clerk if the college wants them handling documents.
   */
  if (viewer.role === 'STAFF' && viewer.staffId !== null && document.studentId !== null) {
    if (!studentInTeachingScope) {
      return {
        allowed: false,
        code: 'OUT_OF_SCOPE',
        reason: 'You can only see documents for students in your own sections.',
      }
    }
    return sensitiveOk ? { allowed: true } : { allowed: false, code: 'SENSITIVE', reason: SENSITIVE_REASON }
  }

  /**
   * Rule 4 — everything else is refused. Notably, one staff member cannot read
   * another staff member's file, and a student cannot read anybody else's.
   */
  return {
    allowed: false,
    code: 'NO_PERMISSION',
    reason: 'You do not have access to this document.',
  }
}

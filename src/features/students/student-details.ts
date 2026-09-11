/**
 * Everything the college records about a student, as one shape.
 *
 * **No `'use client'` here, deliberately.** The edit page is a Server
 * Component and calls `studentDetailsFrom` to fill the form. Every export of a
 * `'use client'` module is a client *reference* on the server, not the
 * function itself, so calling one from a page throws — which is exactly what
 * happened the first time these lived alongside the boxes. The pure parts sit
 * here; the boxes that use them sit in `student-details-fields.tsx`.
 */

export interface StudentDetailsValue {
  // Personal
  fullName: string
  dateOfBirth: string
  gender: string
  phone: string
  email: string
  address: string
  city: string
  cnicBformNumber: string

  // Guardian
  fatherName: string
  fatherCnic: string
  fatherPhone: string
  fatherOccupation: string
  motherName: string
  guardianName: string
  guardianRelation: string
  guardianPhone: string

  // Previous education
  previousInstitution: string
  previousResultSummary: string
  previousResultObtained: string
  previousResultTotal: string
  matricRollNumber: string
  matricBoard: string

  notes: string

  // Admission
  admissionNumber: string
  admissionDate: string
}

export const EMPTY_STUDENT_DETAILS: StudentDetailsValue = {
  fullName: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  cnicBformNumber: '',
  fatherName: '',
  fatherCnic: '',
  fatherPhone: '',
  fatherOccupation: '',
  motherName: '',
  guardianName: '',
  guardianRelation: '',
  guardianPhone: '',
  previousInstitution: '',
  previousResultSummary: '',
  previousResultObtained: '',
  previousResultTotal: '',
  matricRollNumber: '',
  matricBoard: '',
  notes: '',
  admissionNumber: '',
  admissionDate: '',
}

/**
 * The details as the API wants them: the two mark boxes become numbers, and an
 * empty box becomes `undefined` rather than `0` — "not recorded" and "zero" are
 * different answers, and a student who scored nothing is not the same as one
 * whose old result nobody has typed in yet.
 */
export function studentDetailsPayload(details: StudentDetailsValue) {
  const numeric = (value: string) => (value.trim() === '' ? undefined : Number(value))
  return {
    ...details,
    previousResultObtained: numeric(details.previousResultObtained),
    previousResultTotal: numeric(details.previousResultTotal),
  }
}

/** Turns whatever the API gave back into boxes a form can hold. */
export function studentDetailsFrom(student: Partial<Record<keyof StudentDetailsValue, unknown>>): StudentDetailsValue {
  // A Date has to be handled by name: `String(new Date())` gives "Thu Sep 11
  // 2026 05:00:00 GMT+0500", which slicing would turn into "Thu Sep 1" and put
  // in a date box as nothing at all.
  const text = (value: unknown) => {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }
  const result = { ...EMPTY_STUDENT_DETAILS }
  for (const key of Object.keys(EMPTY_STUDENT_DETAILS) as (keyof StudentDetailsValue)[]) {
    result[key] = text(student[key])
  }
  // Dates arrive as ISO instants or plain dates; an <input type="date"> wants
  // the plain date, and slicing is safe for both.
  result.dateOfBirth = result.dateOfBirth.slice(0, 10)
  result.admissionDate = result.admissionDate.slice(0, 10)
  return result
}

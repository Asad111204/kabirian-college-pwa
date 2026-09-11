/**
 * Everything the college records about a staff member, as one shape.
 *
 * **No `'use client'` here, deliberately.** The edit page is a Server
 * Component and calls `staffDetailsFrom` to fill the form. Every export of a
 * `'use client'` module is a client *reference* on the server rather than the
 * function itself, so calling one from a page throws. The pure parts sit here;
 * the boxes that use them sit in `staff-details-fields.tsx`.
 */
import { paisaToRupeeInput } from '@/lib/money'

export interface StaffDetailsValue {
  // Employment
  designationId: string
  departmentId: string
  staffType: string
  joiningDate: string
  qualification: string
  /** **Rupees, as typed.** Never paisa — see `staffDetailsFrom`. */
  salaryPaisa: string

  // Personal
  fullName: string
  fatherOrHusbandName: string
  dateOfBirth: string
  gender: string
  cnicNumber: string

  // Contact
  phone: string
  email: string
  address: string

  notes: string
}

export const EMPTY_STAFF_DETAILS: StaffDetailsValue = {
  designationId: '',
  departmentId: '',
  staffType: 'TEACHING',
  joiningDate: '',
  qualification: '',
  salaryPaisa: '',
  fullName: '',
  fatherOrHusbandName: '',
  dateOfBirth: '',
  gender: '',
  cnicNumber: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

/**
 * A stored staff record as boxes a form can hold.
 *
 * **The salary is the one that bites.** It is stored in paisa and the box is
 * labelled "Rs", and `amountPaisa` reads a string as rupees — so putting the
 * stored 4500000 straight into the box and saving it would file a salary of
 * Rs 4,500,000 instead of Rs 45,000. It is converted back to rupees here, once,
 * where the mistake cannot be repeated.
 */
export function staffDetailsFrom(staff: {
  designationId?: string | null
  departmentId?: string | null
  staffType?: string | null
  joiningDate?: Date | string | null
  qualification?: string | null
  salaryPaisa?: number | null
  fullName?: string | null
  fatherOrHusbandName?: string | null
  dateOfBirth?: Date | string | null
  gender?: string | null
  cnicNumber?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}): StaffDetailsValue {
  const date = (value: Date | string | null | undefined) => {
    if (!value) return ''
    return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10)
  }
  const text = (value: string | null | undefined) => value ?? ''

  return {
    designationId: text(staff.designationId),
    departmentId: text(staff.departmentId),
    staffType: text(staff.staffType) || 'TEACHING',
    joiningDate: date(staff.joiningDate),
    qualification: text(staff.qualification),
    salaryPaisa:
      staff.salaryPaisa === null || staff.salaryPaisa === undefined
        ? ''
        : paisaToRupeeInput(staff.salaryPaisa),
    fullName: text(staff.fullName),
    fatherOrHusbandName: text(staff.fatherOrHusbandName),
    dateOfBirth: date(staff.dateOfBirth),
    gender: text(staff.gender),
    cnicNumber: text(staff.cnicNumber),
    phone: text(staff.phone),
    email: text(staff.email),
    address: text(staff.address),
    notes: text(staff.notes),
  }
}

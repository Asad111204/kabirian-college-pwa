'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import type { StudentDetailsValue } from './student-details'

/**
 * Everything the college records about a student, as one set of boxes.
 *
 * There is exactly one copy of them, used by the admission form and by the
 * office's edit form. That is the point: a field added at admission and
 * forgotten on the edit screen is a field nobody can ever correct, which is
 * how this screen came to be asked for in the first place.
 *
 * The shape and the conversions live in `student-details.ts`, which has no
 * `'use client'` so a Server Component can call them.
 */

export function StudentDetailsFields({
  value,
  onChange,
  errors,
  disabled,
  /**
   * The two numbers the office does not type. At admission both are produced
   * by the server; afterwards the student ID is fixed for good and the
   * admission number can be corrected.
   */
  admission,
  autoFocus,
}: {
  value: StudentDetailsValue
  onChange: (next: StudentDetailsValue) => void
  errors: Record<string, string[]>
  disabled?: boolean
  admission:
    | { mode: 'create'; nextStudentCode: string | null; nextAdmissionNumber: string | null }
    | { mode: 'edit'; studentCode: string }
  autoFocus?: boolean
}) {
  const set = React.useCallback(
    (field: keyof StudentDetailsValue, next: string) => {
      onChange({ ...value, [field]: next })
    },
    [onChange, value],
  )

  return (
    <>
      {/* Admission */}
      <Card>
        <CardHeader>
          <CardTitle>Admission</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* The student ID is the college's permanent handle on this person.
              It is shown, never typed: at admission it is what the server will
              assign, and afterwards it does not change at all. */}
          <Field
            label="Student ID"
            hint={
              admission.mode === 'create'
                ? 'Generated automatically when you save.'
                : 'Assigned at admission. This never changes.'
            }
          >
            <Input
              value={admission.mode === 'create' ? (admission.nextStudentCode ?? 'STU-…') : admission.studentCode}
              disabled
              readOnly
              className="font-mono"
            />
          </Field>

          <Field
            label="Admission number"
            htmlFor="admissionNumber"
            required={admission.mode === 'edit'}
            hint={
              admission.mode === 'create'
                ? `Leave blank to use ${admission.nextAdmissionNumber ?? 'the next number'}.`
                : 'Changing this changes what appears on the student’s papers.'
            }
            error={errors.admissionNumber}
          >
            <Input
              id="admissionNumber"
              value={value.admissionNumber}
              onChange={(e) => set('admissionNumber', e.target.value)}
              placeholder={admission.mode === 'create' ? (admission.nextAdmissionNumber ?? '') : ''}
              className="font-mono"
              disabled={disabled}
            />
          </Field>

          <Field label="Admission date" htmlFor="admissionDate" required error={errors.admissionDate}>
            <Input
              id="admissionDate"
              type="date"
              value={value.admissionDate}
              onChange={(e) => set('admissionDate', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Personal */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" required error={errors.fullName}>
            <Input
              id="fullName"
              value={value.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder="e.g. Muhammad Ali"
              disabled={disabled}
              autoFocus={autoFocus}
            />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth}>
            <Input
              id="dateOfBirth"
              type="date"
              value={value.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Gender" htmlFor="gender" error={errors.gender}>
            <Select
              id="gender"
              value={value.gender}
              onChange={(e) => set('gender', e.target.value)}
              disabled={disabled}
            >
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field
            label="CNIC / B-Form number"
            htmlFor="cnicBformNumber"
            hint="Format: 12345-1234567-1"
            error={errors.cnicBformNumber}
          >
            <Input
              id="cnicBformNumber"
              value={value.cnicBformNumber}
              onChange={(e) => set('cnicBformNumber', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={disabled}
            />
          </Field>

          <Field label="Contact number" htmlFor="phone" hint="Format: 0300-1234567" error={errors.phone}>
            <Input
              id="phone"
              value={value.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0300-1234567"
              disabled={disabled}
            />
          </Field>

          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={value.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="City" htmlFor="city" error={errors.city}>
            <Input
              id="city"
              value={value.city}
              onChange={(e) => set('city', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Address" htmlFor="address" className="sm:col-span-2" error={errors.address}>
            <Textarea
              id="address"
              value={value.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Guardian */}
      <Card>
        <CardHeader>
          <CardTitle>Parent / guardian</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Father's name" htmlFor="fatherName" required error={errors.fatherName}>
            <Input
              id="fatherName"
              value={value.fatherName}
              onChange={(e) => set('fatherName', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Father's CNIC" htmlFor="fatherCnic" hint="Format: 12345-1234567-1" error={errors.fatherCnic}>
            <Input
              id="fatherCnic"
              value={value.fatherCnic}
              onChange={(e) => set('fatherCnic', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={disabled}
            />
          </Field>

          <Field label="Father's contact number" htmlFor="fatherPhone" error={errors.fatherPhone}>
            <Input
              id="fatherPhone"
              value={value.fatherPhone}
              onChange={(e) => set('fatherPhone', e.target.value)}
              placeholder="0300-1234567"
              disabled={disabled}
            />
          </Field>

          <Field label="Father's occupation" htmlFor="fatherOccupation" error={errors.fatherOccupation}>
            <Input
              id="fatherOccupation"
              value={value.fatherOccupation}
              onChange={(e) => set('fatherOccupation', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Mother's name" htmlFor="motherName" error={errors.motherName}>
            <Input
              id="motherName"
              value={value.motherName}
              onChange={(e) => set('motherName', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field
            label="Guardian's name"
            htmlFor="guardianName"
            hint="Only if different from the father."
            error={errors.guardianName}
          >
            <Input
              id="guardianName"
              value={value.guardianName}
              onChange={(e) => set('guardianName', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Guardian's relation" htmlFor="guardianRelation" error={errors.guardianRelation}>
            <Input
              id="guardianRelation"
              value={value.guardianRelation}
              onChange={(e) => set('guardianRelation', e.target.value)}
              placeholder="e.g. Uncle"
              disabled={disabled}
            />
          </Field>

          <Field label="Guardian's contact number" htmlFor="guardianPhone" error={errors.guardianPhone}>
            <Input
              id="guardianPhone"
              value={value.guardianPhone}
              onChange={(e) => set('guardianPhone', e.target.value)}
              placeholder="0300-1234567"
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Previous education */}
      <Card>
        <CardHeader>
          <CardTitle>Previous education</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Previous school / college" htmlFor="previousInstitution" error={errors.previousInstitution}>
            <Input
              id="previousInstitution"
              value={value.previousInstitution}
              onChange={(e) => set('previousInstitution', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Matric board" htmlFor="matricBoard" error={errors.matricBoard}>
            <Input
              id="matricBoard"
              value={value.matricBoard}
              onChange={(e) => set('matricBoard', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="10th (matric) roll number" htmlFor="matricRollNumber" error={errors.matricRollNumber}>
            <Input
              id="matricRollNumber"
              value={value.matricRollNumber}
              onChange={(e) => set('matricRollNumber', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Previous result (summary)" htmlFor="previousResultSummary" error={errors.previousResultSummary}>
            <Input
              id="previousResultSummary"
              value={value.previousResultSummary}
              onChange={(e) => set('previousResultSummary', e.target.value)}
              placeholder="e.g. Matric 2026 — A grade"
              disabled={disabled}
            />
          </Field>

          <Field label="Marks obtained" htmlFor="previousResultObtained" error={errors.previousResultObtained}>
            <Input
              id="previousResultObtained"
              type="number"
              inputMode="numeric"
              value={value.previousResultObtained}
              onChange={(e) => set('previousResultObtained', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field label="Total marks" htmlFor="previousResultTotal" error={errors.previousResultTotal}>
            <Input
              id="previousResultTotal"
              type="number"
              inputMode="numeric"
              value={value.previousResultTotal}
              onChange={(e) => set('previousResultTotal', e.target.value)}
              placeholder="e.g. 1100"
              disabled={disabled}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="notes"
            className="sm:col-span-2"
            hint="Anything the office needs on record. The student never sees this."
            error={errors.notes}
          >
            <Textarea
              id="notes"
              value={value.notes}
              onChange={(e) => set('notes', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>
    </>
  )
}

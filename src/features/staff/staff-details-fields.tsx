'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { STAFF_TYPES, STAFF_TYPE_LABEL } from '@/validation/staff'
import type { StaffDetailsValue } from './staff-details'

/**
 * Everything the college records about a staff member, as one set of boxes.
 *
 * One copy, used by the "add staff" form and by the office's edit form, so a
 * box that exists on one is on the other by construction. A detail that can be
 * entered but never corrected is a detail that stays wrong.
 *
 * The shape and the conversions live in `staff-details.ts`, which has no
 * `'use client'` so a Server Component can call them.
 */

export function StaffDetailsFields({
  value,
  onChange,
  errors,
  disabled,
  designations,
  departments,
  /** The staff ID: what the server will assign, or the one already assigned. */
  staffCode,
  staffCodeHint,
  autoFocus,
}: {
  value: StaffDetailsValue
  onChange: (next: StaffDetailsValue) => void
  errors: Record<string, string[]>
  disabled?: boolean
  designations: { id: string; name: string; isTeaching: boolean }[]
  departments: { id: string; name: string }[]
  staffCode: string
  staffCodeHint: string
  autoFocus?: boolean
}) {
  const set = React.useCallback(
    (field: keyof StaffDetailsValue, next: string) => {
      onChange({ ...value, [field]: next })
    },
    [onChange, value],
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Staff ID" hint={staffCodeHint}>
            <Input value={staffCode} disabled readOnly className="font-mono" />
          </Field>

          <Field label="Joining date" htmlFor="joiningDate" required error={errors.joiningDate}>
            <Input
              id="joiningDate"
              type="date"
              value={value.joiningDate}
              onChange={(e) => set('joiningDate', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field
            label="Designation"
            htmlFor="designationId"
            required
            hint="Managed in Academic Management → Designations."
            error={errors.designationId}
          >
            <Select
              id="designationId"
              value={value.designationId}
              onChange={(e) => set('designationId', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select a designation…</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Department" htmlFor="departmentId" error={errors.departmentId}>
            <Select
              id="departmentId"
              value={value.departmentId}
              onChange={(e) => set('departmentId', e.target.value)}
              disabled={disabled}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Staff type"
            htmlFor="staffType"
            required
            hint="Only teaching staff can be assigned subjects."
            error={errors.staffType}
          >
            <Select
              id="staffType"
              value={value.staffType}
              onChange={(e) => set('staffType', e.target.value)}
              disabled={disabled}
            >
              {STAFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STAFF_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Qualification" htmlFor="qualification" error={errors.qualification}>
            <Input
              id="qualification"
              value={value.qualification}
              onChange={(e) => set('qualification', e.target.value)}
              placeholder="e.g. MSc Botany"
              disabled={disabled}
            />
          </Field>

          <Field
            label="Salary per month (Rs)"
            htmlFor="salaryPaisa"
            hint="Optional. Leave it empty if the college has not settled one."
            error={errors.salaryPaisa}
          >
            <Input
              id="salaryPaisa"
              inputMode="decimal"
              value={value.salaryPaisa}
              onChange={(e) => set('salaryPaisa', e.target.value)}
              placeholder="e.g. 45000"
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

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
              placeholder="e.g. Muhammad Ahmed"
              disabled={disabled}
              autoFocus={autoFocus}
            />
          </Field>

          <Field
            label="Father's / husband's name"
            htmlFor="fatherOrHusbandName"
            error={errors.fatherOrHusbandName}
          >
            <Input
              id="fatherOrHusbandName"
              value={value.fatherOrHusbandName}
              onChange={(e) => set('fatherOrHusbandName', e.target.value)}
              disabled={disabled}
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

          <Field label="CNIC" htmlFor="cnicNumber" hint="Format: 12345-1234567-1" error={errors.cnicNumber}>
            <Input
              id="cnicNumber"
              value={value.cnicNumber}
              onChange={(e) => set('cnicNumber', e.target.value)}
              placeholder="12345-1234567-1"
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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

          <Field label="Address" htmlFor="address" className="sm:col-span-2" error={errors.address}>
            <Textarea
              id="address"
              value={value.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={disabled}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="notes"
            className="sm:col-span-2"
            hint="Anything the office needs on record. The staff member never sees this."
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

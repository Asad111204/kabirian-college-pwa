// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Editing a student and a staff member.
 *
 * The college asked for every detail to be correctable by the office. What
 * matters here: the boxes are filled from the stored record rather than left
 * empty, nothing is sent until something actually changed, the salary survives
 * the round trip in rupees rather than being multiplied by a hundred, and the
 * two numbers the college assigns — the student ID and the staff ID — cannot be
 * typed over.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const put = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put, delete: vi.fn() } }
})

const { EditStudentForm } = await import('@/features/students/edit-student-form')
const { studentDetailsFrom } = await import('@/features/students/student-details')
const { EditStaffForm } = await import('@/features/staff/edit-staff-form')
const { staffDetailsFrom } = await import('@/features/staff/staff-details')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */
/* Reading a stored record into the form                                      */
/* -------------------------------------------------------------------------- */

describe('filling the boxes from the stored record', () => {
  it('turns a Date column into what a date box can hold', () => {
    const details = studentDetailsFrom({
      fullName: 'Ali Raza',
      dateOfBirth: new Date('2008-04-17T00:00:00.000Z'),
      admissionDate: new Date('2026-04-01T00:00:00.000Z'),
    })
    expect(details.dateOfBirth).toBe('2008-04-17')
    expect(details.admissionDate).toBe('2026-04-01')
  })

  it('shows nothing rather than "null" for a field the college never filled in', () => {
    const details = studentDetailsFrom({ fullName: 'Ali Raza', motherName: null, city: undefined })
    expect(details.motherName).toBe('')
    expect(details.city).toBe('')
  })

  it('shows a salary in rupees, not in the paisa it is stored as', () => {
    // The trap: the box is labelled "Rs" and the schema reads a string as
    // rupees, so putting the stored 4500000 in it would save Rs 4,500,000.
    expect(staffDetailsFrom({ salaryPaisa: 4_500_000 }).salaryPaisa).toBe('45000')
    expect(staffDetailsFrom({ salaryPaisa: 1_250_050 }).salaryPaisa).toBe('12500.50')
  })

  it('leaves the salary box empty when the college has not recorded one', () => {
    expect(staffDetailsFrom({ salaryPaisa: null }).salaryPaisa).toBe('')
  })
})

/* -------------------------------------------------------------------------- */
/* The student form                                                           */
/* -------------------------------------------------------------------------- */

const student = studentDetailsFrom({
  fullName: 'Ali Raza',
  fatherName: 'Raza Muhammad',
  admissionNumber: 'ADM-0007',
  admissionDate: '2026-04-01',
  phone: '0300-1111111',
  city: 'Lahore',
})

function renderStudent() {
  return render(
    <EditStudentForm studentId="stu-1" studentCode="STU-0007" initial={student} />,
  )
}

describe('editing a student', () => {
  it('opens with the record already in the boxes', () => {
    renderStudent()
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe('Ali Raza')
    expect((screen.getByLabelText(/Father's name/) as HTMLInputElement).value).toBe('Raza Muhammad')
    expect((screen.getByLabelText(/City/) as HTMLInputElement).value).toBe('Lahore')
  })

  it('shows the student ID but will not let anyone type over it', () => {
    renderStudent()
    const id = screen.getByDisplayValue('STU-0007') as HTMLInputElement
    expect(id.disabled).toBe(true)
    expect(id.readOnly).toBe(true)
  })

  it('cannot be saved until something is different', async () => {
    renderStudent()
    const save = screen.getByRole('button', { name: /Save changes/ })
    expect(save.hasAttribute('disabled')).toBe(true)

    await userEvent.setup().type(screen.getByLabelText(/City/), 'x')
    expect(screen.getByRole('button', { name: /Save changes/ }).hasAttribute('disabled')).toBe(false)
  })

  it('sends the whole record, with the correction in it', async () => {
    put.mockResolvedValueOnce({})
    const user = userEvent.setup()
    renderStudent()

    await user.clear(screen.getByLabelText(/Contact number/))
    await user.type(screen.getByLabelText(/Contact number/), '0321-2222222')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [path, body] = put.mock.calls.at(-1)!
    expect(path).toBe('/api/v1/students/stu-1')
    expect(body).toMatchObject({
      fullName: 'Ali Raza',
      fatherName: 'Raza Muhammad',
      admissionNumber: 'ADM-0007',
      phone: '0321-2222222',
    })
  })

  it('sends the previous result as a number, and omits it when the box is empty', async () => {
    put.mockResolvedValueOnce({})
    const user = userEvent.setup()
    renderStudent()

    await user.type(screen.getByLabelText(/Marks obtained/), '850')
    await user.type(screen.getByLabelText(/Total marks/), '1100')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const body = put.mock.calls.at(-1)![1] as Record<string, unknown>
    expect(body.previousResultObtained).toBe(850)
    expect(body.previousResultTotal).toBe(1100)
    expect(body.matricBoard).toBe('')
  })

  it('refuses a marks total smaller than the marks obtained, before sending anything', async () => {
    const user = userEvent.setup()
    renderStudent()

    await user.type(screen.getByLabelText(/Marks obtained/), '900')
    await user.type(screen.getByLabelText(/Total marks/), '800')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    expect(await screen.findByText('Please check the highlighted fields.')).toBeTruthy()
    expect(screen.getByText('Marks obtained cannot be more than the total.')).toBeTruthy()
    expect(put).not.toHaveBeenCalled()
  })

  it('keeps the typing on screen when the server refuses', async () => {
    const { ApiError } = await import('@/lib/api-client')
    const refusal = Promise.reject(
      new ApiError('That admission number is already used by another student.', 409, 'CONFLICT'),
    )
    refusal.catch(() => {})
    put.mockImplementation(() => refusal)
    const user = userEvent.setup()
    renderStudent()

    await user.clear(screen.getByLabelText(/Admission number/))
    await user.type(screen.getByLabelText(/Admission number/), 'ADM-0001')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    expect(
      await screen.findByText('That admission number is already used by another student.'),
    ).toBeTruthy()
    expect((screen.getByLabelText(/Admission number/) as HTMLInputElement).value).toBe('ADM-0001')
    put.mockReset()
  })

  it('says where enrollment and status are changed instead, rather than offering them here', () => {
    renderStudent()
    expect(screen.getByText(/Transfer/)).toBeTruthy()
    expect(screen.queryByLabelText(/Section/)).toBeNull()
    expect(screen.queryByLabelText(/Roll number/)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* The staff form                                                             */
/* -------------------------------------------------------------------------- */

const DESIGNATION_A = '11111111-1111-4111-8111-111111111111'
const DESIGNATION_B = '22222222-2222-4222-8222-222222222222'
const DEPARTMENT = '33333333-3333-4333-8333-333333333333'

const staff = staffDetailsFrom({
  fullName: 'Sara Khan',
  designationId: DESIGNATION_A,
  departmentId: DEPARTMENT,
  staffType: 'TEACHING',
  joiningDate: new Date('2024-08-01T00:00:00.000Z'),
  salaryPaisa: 4_500_000,
  qualification: 'MSc Botany',
})

const designations = [
  { id: DESIGNATION_A, name: 'Lecturer', isTeaching: true },
  { id: DESIGNATION_B, name: 'Senior Lecturer', isTeaching: true },
]
const departments = [{ id: DEPARTMENT, name: 'Science' }]

function renderStaff() {
  return render(
    <EditStaffForm
      staffId="stf-1"
      staffCode="STF-0003"
      initial={staff}
      designations={designations}
      departments={departments}
    />,
  )
}

describe('editing a staff member', () => {
  it('opens with the record already in the boxes, salary in rupees', () => {
    renderStaff()
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe('Sara Khan')
    expect((screen.getByLabelText(/Salary per month/) as HTMLInputElement).value).toBe('45000')
    expect((screen.getByLabelText(/Designation/) as HTMLSelectElement).value).toBe(DESIGNATION_A)
    expect((screen.getByLabelText(/Joining date/) as HTMLInputElement).value).toBe('2024-08-01')
  })

  it('shows the staff ID but will not let anyone type over it', () => {
    renderStaff()
    const id = screen.getByDisplayValue('STF-0003') as HTMLInputElement
    expect(id.disabled).toBe(true)
    expect(id.readOnly).toBe(true)
  })

  it('cannot be saved until something is different', async () => {
    renderStaff()
    expect(screen.getByRole('button', { name: /Save changes/ }).hasAttribute('disabled')).toBe(true)

    await userEvent.setup().selectOptions(screen.getByLabelText(/Designation/), DESIGNATION_B)
    expect(screen.getByRole('button', { name: /Save changes/ }).hasAttribute('disabled')).toBe(false)
  })

  it('sends the salary as the rupees that are on screen, not as paisa', async () => {
    put.mockResolvedValueOnce({})
    const user = userEvent.setup()
    renderStaff()

    await user.clear(screen.getByLabelText(/Salary per month/))
    await user.type(screen.getByLabelText(/Salary per month/), '52000')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [path, body] = put.mock.calls.at(-1)!
    expect(path).toBe('/api/v1/staff/stf-1')
    expect((body as { salaryPaisa: string }).salaryPaisa).toBe('52000')
  })

  it('refuses a designation that has been cleared, before sending anything', async () => {
    const user = userEvent.setup()
    renderStaff()

    await user.selectOptions(screen.getByLabelText(/Designation/), '')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    expect(await screen.findByText('Please check the highlighted fields.')).toBeTruthy()
    expect(screen.getByText(/valid identifier|required|Choose/i)).toBeTruthy()
    expect(put).not.toHaveBeenCalled()
  })

  it('says where employment status is changed instead, rather than offering it here', () => {
    renderStaff()
    expect(screen.getByText(/status action/)).toBeTruthy()
    expect(screen.queryByLabelText(/Employment status/)).toBeNull()
    expect(screen.queryByLabelText(/Leaving date/)).toBeNull()
  })
})

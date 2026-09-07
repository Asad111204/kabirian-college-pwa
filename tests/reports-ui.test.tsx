// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The report centre.
 *
 * The one property worth locking down: the CSV link is the very query the
 * screen loaded, with `format=csv` added -- so a downloaded file is the rows
 * on screen, by construction. Beyond that: the report area is what prints,
 * the controls are not, and a report that needs an exam says so instead of
 * asking the API for nothing.
 */

const get = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const { ReportCentre } = await import('@/features/reports/report-centre')
const { NAVIGATION } = await import('@/components/layout/nav-config')
const { ApiError } = await import('@/lib/api-client')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SESSION = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222221'
const SECTION = '44444444-4444-4444-8444-444444444441'
const EXAM = '55555555-5555-4555-8555-555555555551'

const options = {
  sessions: [{ id: SESSION, name: '2026-27', isCurrent: true }],
  groups: [
    {
      academicGroupId: '33333333-3333-4333-8333-333333333331',
      classId: CLASS,
      className: '1st Year',
      classLevel: 1,
      divisionId: '22222222-2222-4222-8222-222222222222',
      divisionName: 'Boys',
      programId: '22222222-2222-4222-8222-222222222223',
      programName: 'Pre-Medical',
      sections: [{ id: SECTION, name: 'A', capacity: null, studentCount: 2 }],
    },
  ],
  departments: [{ id: '66666666-6666-4666-8666-666666666661', name: 'Science' }],
  designations: [{ id: '77777777-7777-4777-8777-777777777771', name: 'Lecturer' }],
  exams: [{ id: EXAM, name: 'First Term', sessionName: '2026-27', status: 'SCHEDULED' }],
  collegeName: 'Kabirian College',
}

const studentReport = {
  generatedAt: '2026-09-08T10:00:00.000Z',
  scope: { sessionName: '2026-27', className: null, divisionName: null, programName: null, groupLabel: null, sectionName: null },
  total: 2,
  groups: [
    {
      key: '',
      label: 'All',
      count: 2,
      rows: [
        { studentCode: 'STU-0001', admissionNumber: 'ADM-1', fullName: 'Ali Raza', fatherName: 'Raza Khan', status: 'ACTIVE', admissionDate: '2026-04-01', className: '1st Year', divisionName: 'Boys', programName: 'Pre-Medical', sectionName: 'A', rollNumber: '1', hasAccount: true },
        { studentCode: 'STU-0002', admissionNumber: 'ADM-2', fullName: 'Bilal Ahmed', fatherName: 'Ahmed Khan', status: 'ACTIVE', admissionDate: '2026-04-01', className: '1st Year', divisionName: 'Boys', programName: 'Pre-Medical', sectionName: 'A', rollNumber: '2', hasAccount: false },
      ],
    },
  ],
}

describe('the report centre', () => {
  it('loads the students report for the current session and lists the rows', async () => {
    get.mockResolvedValue(studentReport)
    render(<ReportCentre options={options} />)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    expect(get.mock.calls[0]![0]).toBe(`/api/v1/reports/students?academicSessionId=${SESSION}`)
    expect(await screen.findByText('Ali Raza')).toBeTruthy()
    expect(screen.getByText('Bilal Ahmed')).toBeTruthy()
    expect(screen.getByText('2 in total.')).toBeTruthy()
  })

  it('links the CSV download to the same query the screen loaded, plus format=csv', async () => {
    get.mockResolvedValue(studentReport)
    const user = userEvent.setup()
    render(<ReportCentre options={options} />)
    await screen.findByText('Ali Raza')

    await user.selectOptions(screen.getByLabelText('Section'), SECTION)
    await user.selectOptions(screen.getByLabelText('Group by'), 'section')
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(`/api/v1/reports/students?academicSessionId=${SESSION}&sectionId=${SECTION}&groupBy=section`))

    const csv = screen.getByRole('link', { name: /Download CSV/ })
    expect(csv.getAttribute('href')).toBe(`/api/v1/reports/students?academicSessionId=${SESSION}&sectionId=${SECTION}&groupBy=section&format=csv`)
  })

  it('prints only the report: the report is the print area and the controls are hidden', async () => {
    get.mockResolvedValue(studentReport)
    const { container } = render(<ReportCentre options={options} />)
    await screen.findByText('Ali Raza')
    const area = container.querySelector('.print-area')!
    expect(area).toBeTruthy()
    expect(within(area as HTMLElement).getByText('Kabirian College')).toBeTruthy()
    expect(within(area as HTMLElement).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: /Print/ }).closest('.print-hide')).toBeTruthy()
  })

  it('asks for an exam before loading an exam report, and then loads it', async () => {
    // The students report loads first (the default tab); answer each endpoint with its own shape.
    const examOut = { exam: { id: EXAM, name: 'First Term', examTypeName: 'Term', sessionName: '2026-27', status: 'SCHEDULED' }, papers: [], totals: { papers: 0, submitted: 0, open: 0, notOpened: 0 } }
    get.mockImplementation((url: string) => Promise.resolve(url.includes('/reports/exams') ? examOut : studentReport))
    const user = userEvent.setup()
    render(<ReportCentre options={{ ...options, exams: [] }} />)
    await user.click(screen.getByRole('button', { name: 'Exam mark sheets' }))
    expect(await screen.findByText('Choose an exam')).toBeTruthy()
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/api/v1/reports/exams'))

    cleanup()
    render(<ReportCentre options={options} initialKind="exams" />)
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/api/v1/reports/exams?examId=${EXAM}`))
    expect(await screen.findByText(/0 of 0 mark sheets submitted/)).toBeTruthy()
  })

  it('shows the group headings and counts when grouped', async () => {
    get.mockResolvedValue({
      ...studentReport,
      groups: [
        { key: 'a', label: '1st Year · Boys · Pre-Medical · Section A', count: 1, rows: [studentReport.groups[0]!.rows[0]] },
        { key: 'b', label: '1st Year · Boys · Pre-Medical · Section B', count: 1, rows: [studentReport.groups[0]!.rows[1]] },
      ],
    })
    render(<ReportCentre options={options} />)
    expect(await screen.findByText(/Section A/)).toBeTruthy()
    expect(screen.getByText(/Section B/)).toBeTruthy()
    expect(screen.getAllByText(/· 1$/).length).toBe(2)
  })

  it('says so when the API refuses, rather than showing an empty report', async () => {
    get.mockRejectedValue(new ApiError('Generating reports needs a permission you do not hold.', 403, 'FORBIDDEN'))
    render(<ReportCentre options={options} />)
    expect(await screen.findByText(/needs a permission/)).toBeTruthy()
    expect(screen.queryByText('in total.')).toBeNull()
  })

  it('is in the office navigation and nowhere else', () => {
    expect(NAVIGATION.ADMIN.flatMap((s) => s.items).map((i) => i.href)).toContain('/admin/reports')
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(NAVIGATION[role].flatMap((s) => s.items).some((i) => /report/i.test(i.href) && i.href.startsWith('/admin'))).toBe(false)
    }
  })
})

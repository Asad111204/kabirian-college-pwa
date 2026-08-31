// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The student's attendance page.
 *
 * The rules being checked: a student sees only their own record, the page never
 * does its own arithmetic, zero counted sessions is not 0%, and daily roll-call
 * is never folded into a subject.
 */

const get = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

const { StudentAttendanceView } = await import('@/features/attendance/student-attendance-view')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const summary = (present = 0, absent = 0, late = 0, leave = 0, percentage: number | null = null) => ({
  present,
  absent,
  late,
  leave,
  total: present + absent + late + leave,
  attended: present + late,
  percentage,
})

const baseData = {
  enrollment: {
    academicSessionId: 'sess-1',
    sessionName: '2026-27',
    className: '1st Year',
    divisionName: 'Boys',
    programName: 'Pre-Medical',
    sectionName: 'A',
    rollNumber: '12',
  },
  overall: summary(16, 2, 2, 0, 90),
  bySubject: [
    { subjectId: 'bio', subjectName: 'Biology', ...summary(16, 1, 1, 0, 94.4) },
    { subjectId: 'phy', subjectName: 'Physics', ...summary(15, 3, 2, 0, 85) },
  ],
  daily: { subjectId: null, subjectName: 'Daily roll call', ...summary(10, 1, 0, 0, 90.9) },
  history: {
    items: [
      { date: '2026-08-30', period: 2, subjectId: 'bio', subjectName: 'Biology', status: 'PRESENT' as const },
      { date: '2026-08-29', period: 1, subjectId: null, subjectName: 'Daily roll call', status: 'ABSENT' as const },
      { date: '2026-08-28', period: 3, subjectId: 'phy', subjectName: 'Physics', status: 'LATE' as const },
    ],
    page: 1,
    pageSize: 25,
    total: 3,
    totalPages: 1,
  },
  subjectsInHistory: [
    { id: null, name: 'Daily roll call' },
    { id: 'bio', name: 'Biology' },
    { id: 'phy', name: 'Physics' },
  ],
}

function renderView(overrides: Record<string, unknown> = {}) {
  return render(<StudentAttendanceView initial={{ ...baseData, ...overrides } as never} />)
}

describe('the overall summary', () => {
  it('shows the percentage the server calculated', () => {
    renderView()
    expect(screen.getByText('90%')).toBeTruthy()
    expect(screen.getByText('18 of 20 classes attended')).toBeTruthy()
  })

  it('shows each count', () => {
    renderView()
    const card = screen.getByText('Overall attendance').closest('div')!.parentElement!
    expect(within(card).getByText('16')).toBeTruthy()
    expect(within(card).getByText('Present')).toBeTruthy()
  })

  it('says "No attendance recorded yet" rather than 0% when nothing is counted', () => {
    renderView({ overall: summary(0, 0, 0, 0, null), history: { ...baseData.history, items: [], total: 0 } })
    expect(screen.getAllByText('No attendance recorded yet').length).toBeGreaterThan(0)
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('does not recompute the percentage itself', () => {
    // Counts that would give 90% by the college rule, but the server said 42%.
    // The page must show what the server said.
    renderView({ overall: { ...summary(16, 2, 2, 0), percentage: 42 } })
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.queryByText('90%')).toBeNull()
  })
})

describe('the subject breakdown', () => {
  it('shows a card per subject with its own percentage', () => {
    renderView()
    // Scoped to the breakdown: the names also appear in the history table and
    // in the subject filter, which is correct.
    const section = screen.getByRole('heading', { name: 'By subject' }).parentElement!
    expect(within(section).getByText('Biology')).toBeTruthy()
    expect(within(section).getByText('94.4%')).toBeTruthy()
    expect(within(section).getByText('Physics')).toBeTruthy()
    expect(within(section).getByText('85%')).toBeTruthy()
  })

  it('keeps daily roll call separate from the subjects', () => {
    renderView()
    const heading = screen.getByRole('heading', { name: 'Daily roll call' })
    expect(heading).toBeTruthy()
    // Its own percentage, not merged into Biology or Physics.
    expect(screen.getByText('90.9%')).toBeTruthy()
  })

  it('omits the daily section when there is no roll-call attendance', () => {
    renderView({ daily: null })
    expect(screen.queryByRole('heading', { name: 'Daily roll call' })).toBeNull()
  })

  it('shows no subject cards when the student has no subject attendance', () => {
    renderView({ bySubject: [] })
    expect(screen.queryByRole('heading', { name: 'By subject' })).toBeNull()
  })
})

describe('the attendance record', () => {
  it('lists date, subject, period and status', () => {
    renderView()
    const table = screen.getByRole('table')
    expect(within(table).getByText('30 Aug 2026')).toBeTruthy()
    expect(within(table).getByText('Biology')).toBeTruthy()
    expect(within(table).getAllByText('Present').length).toBeGreaterThan(0)
  })

  it('names daily roll-call rows honestly, without inventing a subject', () => {
    renderView()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Daily roll call')).toBeTruthy()
  })

  it('shows each status as a word, not colour alone', () => {
    renderView()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Absent')).toBeTruthy()
    expect(within(table).getByText('Late')).toBeTruthy()
  })

  it('says so when nothing has been recorded', () => {
    renderView({ history: { ...baseData.history, items: [], total: 0 } })
    expect(screen.getAllByText('No attendance recorded yet').length).toBeGreaterThan(0)
  })
})

describe('filters', () => {
  it('asks the server for a narrower date range', async () => {
    get.mockResolvedValueOnce({ ...baseData, history: { ...baseData.history, items: [], total: 0 } })
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Date range'), '7')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(String(get.mock.calls[0]?.[0])).toMatch(/dateFrom=/)
  })

  it('filters by subject using its id', async () => {
    get.mockResolvedValueOnce(baseData)
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Subject'), 'bio')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(String(get.mock.calls[0]?.[0])).toContain('subject=bio')
  })

  it('filters daily roll-call separately from subjects', async () => {
    get.mockResolvedValueOnce(baseData)
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Subject'), 'DAILY')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(String(get.mock.calls[0]?.[0])).toContain('subject=DAILY')
  })

  it('filters by status', async () => {
    get.mockResolvedValueOnce(baseData)
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ABSENT')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(String(get.mock.calls[0]?.[0])).toContain('status=ABSENT')
  })

  it('only offers subjects that appear in this student’s own history', () => {
    renderView({ subjectsInHistory: [{ id: 'bio', name: 'Biology' }] })
    const select = screen.getByLabelText('Subject')
    expect(within(select).getByRole('option', { name: 'Biology' })).toBeTruthy()
    expect(within(select).queryByRole('option', { name: 'Physics' })).toBeNull()
  })

  it('says when a filter matches nothing, and offers a way back', async () => {
    get.mockResolvedValueOnce({ ...baseData, history: { ...baseData.history, items: [], total: 0 } })
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'LEAVE')
    expect(await screen.findByText('No attendance matches these filters')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('shows a loading state rather than a blank page', async () => {
    let resolve!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ABSENT')
    expect(screen.getByText('Loading your attendance…')).toBeTruthy()
    resolve(baseData)
    await waitFor(() => expect(screen.queryByText('Loading your attendance…')).toBeNull())
  })

  it('explains a failure instead of showing nothing', async () => {
    const { ApiError } = await import('@/lib/api-client')
    get.mockRejectedValueOnce(new ApiError('Something went wrong.', 500, 'INTERNAL_ERROR'))
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ABSENT')
    expect(await screen.findByText('Could not load your attendance')).toBeTruthy()
  })
})

describe('paging', () => {
  it('asks the server for the next page', async () => {
    get.mockResolvedValueOnce(baseData)
    renderView({ history: { ...baseData.history, total: 60, totalPages: 3 } })
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(String(get.mock.calls[0]?.[0])).toContain('page=2')
  })
})

describe('enrolment and privacy', () => {
  it('shows the student’s own class and roll number', () => {
    renderView()
    expect(screen.getByText(/2026-27 · 1st Year · Boys · Pre-Medical · Section A · Roll 12/)).toBeTruthy()
  })

  it('says when the student is not currently enrolled', () => {
    renderView({ enrollment: null })
    expect(screen.getByText('Not currently enrolled')).toBeTruthy()
  })

  it('never asks the API for another student', async () => {
    get.mockResolvedValueOnce(baseData)
    renderView()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ABSENT')
    await waitFor(() => expect(get).toHaveBeenCalled())
    for (const call of get.mock.calls) {
      expect(String(call[0])).not.toMatch(/studentId/i)
    }
  })

  it('shows no other student, and no sensitive fields', () => {
    const { container } = renderView()
    expect(container.textContent).not.toMatch(/CNIC|B-Form|admission/i)
  })

  it('offers no control that could change attendance', () => {
    renderView()
    const labels = screen.queryAllByRole('button').map((b) => b.textContent ?? '')
    for (const forbidden of [/mark/i, /submit/i, /cancel/i, /correct/i, /save/i]) {
      expect(labels.some((l) => forbidden.test(l))).toBe(false)
    }
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The teacher's attendance screens.
 *
 * These check the rules the staff portal is supposed to enforce visually: that a
 * teacher is only ever offered what they are assigned, that a submitted register
 * offers no editing at all, and that submitting warns about students still
 * carrying the default mark.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

const post = vi.fn()
const patch = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return {
    ...actual,
    api: { get: vi.fn(), post, patch, put: vi.fn(), delete: vi.fn() },
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TeacherAttendanceOptions } = await import(
  '@/features/attendance/teacher-attendance-options'
)
const { TeacherRegisterView } = await import('@/features/attendance/teacher-register-view')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */
/* What a teacher is offered                                                  */
/* -------------------------------------------------------------------------- */

const subjectOption = {
  kind: 'subject' as const,
  sectionId: 'sec-1',
  subjectId: 'bio',
  subjectName: 'Biology',
  sessionName: '2026-27',
  className: '1st Year',
  divisionName: 'Boys',
  programName: 'Pre-Medical',
  sectionName: 'A',
  studentCount: 30,
  todaySheets: [],
}

const dailyOption = {
  ...subjectOption,
  kind: 'daily' as const,
  subjectId: null,
  subjectName: null,
}

function renderOptions(options: unknown[], canCreate = true) {
  return render(
    <TeacherAttendanceOptions
      options={options as never}
      today="2026-08-30"
      todayLabel="30 Aug 2026"
      canCreate={canCreate}
    />,
  )
}

describe('a teacher with no assignments', () => {
  it('is told what to do rather than shown an empty list', () => {
    renderOptions([])
    expect(screen.getByText('No attendance assignments yet')).toBeTruthy()
    expect(screen.getByText(/Ask the administrator/)).toBeTruthy()
  })
})

describe('the list of what a teacher may mark', () => {
  it('shows a subject assignment under Subjects, with its class', () => {
    renderOptions([subjectOption])
    expect(screen.getByText('Subjects')).toBeTruthy()
    expect(screen.getByText('Biology')).toBeTruthy()
    expect(screen.getByText(/1st Year · Boys · Pre-Medical · Section A/)).toBeTruthy()
  })

  it('shows an in-charge section under Daily roll call, with no subject', () => {
    renderOptions([dailyOption])
    expect(screen.getByRole('heading', { name: /Daily roll call/ })).toBeTruthy()
    expect(screen.queryByText('Biology')).toBeNull()
  })

  it('separates the two kinds', () => {
    renderOptions([subjectOption, dailyOption])
    expect(screen.getByRole('heading', { name: 'Subjects' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Daily roll call/ })).toBeTruthy()
    // Biology sits under Subjects, and the in-charge card under Daily roll call.
    expect(screen.getByText('Biology')).toBeTruthy()
  })

  it('offers Start attendance when nothing has been recorded yet', () => {
    renderOptions([subjectOption])
    expect(screen.getByRole('button', { name: /Start attendance/ })).toBeTruthy()
  })

  it('starts a register for the chosen section, subject and date', async () => {
    post.mockResolvedValueOnce({ id: 'sheet-9' })
    renderOptions([subjectOption])
    await userEvent.click(screen.getByRole('button', { name: /Start attendance/ }))

    expect(post).toHaveBeenCalledWith('/api/v1/attendance/sheets', {
      sectionId: 'sec-1',
      subjectId: 'bio',
      date: '2026-08-30',
      period: 1,
    })
    expect(push).toHaveBeenCalledWith('/staff/attendance/sheet-9')
  })

  it('sends subjectId null for a daily roll call, never a fake subject', async () => {
    post.mockResolvedValueOnce({ id: 'sheet-10' })
    renderOptions([dailyOption])
    await userEvent.click(screen.getByRole('button', { name: /Start attendance/ }))
    expect(post.mock.calls[0]?.[1]).toMatchObject({ subjectId: null })
  })

  it('refuses to start for a section with no students', () => {
    renderOptions([{ ...subjectOption, studentCount: 0 }])
    expect(screen.getByText('No active students are enrolled in this section.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start attendance/ })).toBeNull()
  })

  it('hides Start attendance without the create permission', () => {
    renderOptions([subjectOption], false)
    expect(screen.queryByRole('button', { name: /Start attendance/ })).toBeNull()
  })

  it('explains a duplicate register in plain words', async () => {
    const { ApiError } = await import('@/lib/api-client')
    post.mockRejectedValueOnce(new ApiError('conflict', 409, 'CONFLICT'))
    renderOptions([subjectOption])
    await userEvent.click(screen.getByRole('button', { name: /Start attendance/ }))
    expect(
      await screen.findByText('Attendance for this period has already been opened.'),
    ).toBeTruthy()
  })
})

describe('when today is already recorded', () => {
  it('offers to continue a draft rather than start again', () => {
    renderOptions([
      { ...subjectOption, todaySheets: [{ id: 's1', period: 1, status: 'DRAFT' }] },
    ])
    expect(screen.getByText('Attendance already recorded')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue draft' })).toBeTruthy()
  })

  it('offers to view a submitted register', () => {
    renderOptions([
      { ...subjectOption, todaySheets: [{ id: 's1', period: 1, status: 'SUBMITTED' }] },
    ])
    expect(screen.getByText('Submitted')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View register' })).toBeTruthy()
  })

  it('shows a cancelled register as cancelled', () => {
    renderOptions([
      { ...subjectOption, todaySheets: [{ id: 's1', period: 1, status: 'CANCELLED' }] },
    ])
    expect(screen.getByText('Cancelled')).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */
/* The register itself                                                        */
/* -------------------------------------------------------------------------- */

const entries = [
  { id: 'e1', studentId: 'st1', studentCode: 'STU-0001', fullName: 'Ali Raza', rollNumber: '1', status: 'PRESENT' as const, remarks: null },
  { id: 'e2', studentId: 'st2', studentCode: 'STU-0002', fullName: 'Bilal Ahmed', rollNumber: '2', status: 'PRESENT' as const, remarks: null },
]

const baseRegister = {
  id: 'sheet-1',
  date: '2026-08-30',
  period: 2,
  status: 'DRAFT' as const,
  sectionName: 'A',
  className: '1st Year',
  divisionName: 'Boys',
  programName: 'Pre-Medical',
  subjectName: 'Biology',
  markedByName: 'Sara Khan',
  submittedAt: null,
  cancelledReason: null,
  studentCount: 2,
  entries,
}

function renderRegister(overrides: Record<string, unknown> = {}, canUpdate = true) {
  return render(
    <TeacherRegisterView
      register={{ ...baseRegister, ...overrides } as never}
      canUpdate={canUpdate}
    />,
  )
}

describe('a draft register', () => {
  it('says plainly that it does not count yet', () => {
    renderRegister()
    expect(screen.getByText('Draft — not submitted yet')).toBeTruthy()
  })

  it('lists every student with a marking control', () => {
    renderRegister()
    expect(screen.getByText('Ali Raza')).toBeTruthy()
    expect(screen.getByText('STU-0002')).toBeTruthy()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
  })

  it('shows no sensitive student information', () => {
    const { container } = renderRegister()
    expect(container.textContent).not.toMatch(/CNIC|B-Form|Father/i)
  })

  it('starts with no unsaved changes and a disabled Save', () => {
    renderRegister()
    expect(screen.getByText('No changes')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save draft/ }).hasAttribute('disabled')).toBe(true)
  })

  it('records an unsaved change when a student is marked', async () => {
    renderRegister()
    const row = screen.getAllByRole('radiogroup')[0]!
    await userEvent.click(within(row).getByRole('radio', { name: /Absent/ }))
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save draft/ }).hasAttribute('disabled')).toBe(false)
  })

  it('marks everyone present in one action', async () => {
    renderRegister({ entries: [{ ...entries[0]!, status: 'ABSENT' as const }, entries[1]!] })
    await userEvent.click(screen.getByRole('button', { name: /Mark all present/ }))
    const first = screen.getAllByRole('radiogroup')[0]!
    expect(within(first).getByRole('radio', { name: /Present/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('accepts P, A, L and E on a focused row, without being the only way', async () => {
    renderRegister()
    const rows = screen.getAllByRole('listitem')
    rows[0]!.focus()
    await userEvent.keyboard('a')
    const first = screen.getAllByRole('radiogroup')[0]!
    expect(within(first).getByRole('radio', { name: /Absent/ }).getAttribute('aria-checked')).toBe('true')
    // The buttons still work — the shortcut is an addition, not a replacement.
    await userEvent.click(within(first).getByRole('radio', { name: /Late/ }))
    expect(within(first).getByRole('radio', { name: /Late/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('only claims "Saved" once the API has confirmed it', async () => {
    patch.mockResolvedValueOnce({})
    renderRegister()
    const row = screen.getAllByRole('radiogroup')[0]!
    await userEvent.click(within(row).getByRole('radio', { name: /Absent/ }))
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    expect(patch).toHaveBeenCalledWith('/api/v1/attendance/sheets/sheet-1', {
      entries: [
        { studentId: 'st1', status: 'ABSENT' },
        { studentId: 'st2', status: 'PRESENT' },
      ],
    })
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('never claims a save that failed', async () => {
    patch.mockRejectedValueOnce(new Error('network down'))
    renderRegister()
    const row = screen.getAllByRole('radiogroup')[0]!
    await userEvent.click(within(row).getByRole('radio', { name: /Absent/ }))
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    expect(await screen.findByText('Unable to save')).toBeTruthy()
    expect(
      screen.getByText('Unable to save attendance. Please check your connection.'),
    ).toBeTruthy()
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

describe('submitting', () => {
  it('warns about students still carrying the default mark', async () => {
    renderRegister()
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
    expect(screen.getByText(/2 students still have the default mark of Present/)).toBeTruthy()
  })

  it('says it is ready once every student has been checked', async () => {
    renderRegister()
    for (const row of screen.getAllByRole('radiogroup')) {
      await userEvent.click(within(row).getByRole('radio', { name: /Present/ }))
    }
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
    expect(screen.getByText('Ready to submit — every student has been checked.')).toBeTruthy()
  })

  it('shows the figures before anything is committed', async () => {
    renderRegister()
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Total students')).toBeTruthy()
    expect(within(dialog).getByText('Present')).toBeTruthy()
  })

  it('saves pending marks and then submits', async () => {
    patch.mockResolvedValueOnce({})
    post.mockResolvedValueOnce({ ...baseRegister, status: 'SUBMITTED', submittedAt: '2026-08-30T10:00:00Z' })
    renderRegister()
    const row = screen.getAllByRole('radiogroup')[0]!
    await userEvent.click(within(row).getByRole('radio', { name: /Absent/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
    await userEvent.click(screen.getByRole('button', { name: /Submit attendance/ }))
    expect(patch).toHaveBeenCalled()
    expect(post).toHaveBeenCalledWith('/api/v1/attendance/sheets/sheet-1/submit')
  })
})

describe('a submitted register', () => {
  const submitted = { status: 'SUBMITTED' as const, submittedAt: '2026-08-30T10:00:00Z' }

  it('tells the teacher to contact the office', () => {
    renderRegister(submitted)
    expect(screen.getByText('Attendance submitted')).toBeTruthy()
    expect(screen.getByText(/cannot be edited. Please contact the office/)).toBeTruthy()
  })

  it('offers no marking controls, no Save and no Submit', () => {
    renderRegister(submitted)
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Save draft/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Submit$/ })).toBeNull()
  })

  it('offers no correction button — that is the office’s job', () => {
    renderRegister(submitted)
    expect(screen.queryByRole('button', { name: /Correct/i })).toBeNull()
  })

  it('still shows every student and their status', () => {
    renderRegister(submitted)
    expect(screen.getByText('Ali Raza')).toBeTruthy()
    expect(screen.getAllByText('Present').length).toBeGreaterThan(0)
  })
})

describe('a cancelled register', () => {
  const cancelled = { status: 'CANCELLED' as const, cancelledReason: 'Public holiday' }

  it('shows the reason and says it does not count', () => {
    renderRegister(cancelled)
    expect(screen.getByText('This class was cancelled')).toBeTruthy()
    expect(screen.getByText(/Public holiday/)).toBeTruthy()
  })

  it('cannot be modified or reopened', () => {
    renderRegister(cancelled)
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Save draft/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Submit$/ })).toBeNull()
  })
})

describe('a teacher without the update permission', () => {
  it('sees the register read-only', () => {
    renderRegister({}, false)
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Save draft/ })).toBeNull()
  })
})

describe('an empty section', () => {
  it('says so instead of showing an empty table', () => {
    renderRegister({ entries: [], studentCount: 0 })
    expect(screen.getByText('No students on this register')).toBeTruthy()
    expect(screen.getByText('No active students are enrolled in this section.')).toBeTruthy()
  })
})

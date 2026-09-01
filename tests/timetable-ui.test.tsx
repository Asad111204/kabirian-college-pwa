// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The timetable screens.
 *
 * Three things matter here beyond "does it render": the break is shown as the
 * break rather than as an empty cell or a made-up lesson; a teacher's own week
 * offers nothing that would change it; and no student-facing timetable exists
 * anywhere in the navigation.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post, patch, put: vi.fn(), delete: del } }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TimetableBuilder } = await import('@/features/timetable/timetable-builder')
const { TeacherTimetableGrid } = await import('@/features/timetable/teacher-timetable')
const { TodayClassesCard } = await import('@/features/timetable/today-classes')
const { NAVIGATION } = await import('@/components/layout/nav-config')
const { PERIODS } = await import('@/server/timetable/periods')
const { ApiError } = await import('@/lib/api-client')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */

const section = {
  sectionId: 'section-1',
  sectionName: 'A',
  className: '1st Year',
  divisionName: 'Boys',
  programName: 'Pre-Medical',
  academicSessionId: 'session-1',
  sessionName: '2026-27',
}

const slot = (over: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  dayOfWeek: 'MONDAY',
  period: 3,
  startTime: '09:10',
  endTime: '10:00',
  subjectId: 'subject-1',
  subjectName: 'Biology',
  staffId: 'staff-1',
  staffName: 'Sara Khan',
  staffCode: 'STF-0001',
  room: 'Lab 1',
  ...over,
})

const timetable = (over: Record<string, unknown> = {}) =>
  ({
    section,
    periods: PERIODS,
    slots: [slot()],
    subjects: [
      {
        subjectId: 'subject-1',
        subjectName: 'Biology',
        subjectCode: 'BIO',
        teachers: [{ staffId: 'staff-1', fullName: 'Sara Khan', staffCode: 'STF-0001' }],
      },
    ],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

const sectionOther = {
  ...section,
  sectionId: 'section-2',
  sectionName: 'B',
  academicSessionId: 'session-2',
  sessionName: '2027-28',
}

const options = {
  sessions: [
    { id: 'session-1', name: '2026-27', isCurrent: true },
    { id: 'session-2', name: '2027-28', isCurrent: false },
  ],
  selectedSessionId: 'session-1',
  currentSession: { id: 'session-1', name: '2026-27' },
  sections: [section],
}

const nextSessionOptions = {
  ...options,
  selectedSessionId: 'session-2',
  sections: [sectionOther],
}

/** Answers the two GETs the builder makes, so a section can be chosen. */
function wireApi(timetableValue: unknown = timetable()) {
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/v1/timetable/options')) {
      return url.includes('session-2') ? nextSessionOptions : options
    }
    if (url.startsWith('/api/v1/timetable/section')) return timetableValue
    throw new Error(`unexpected GET ${url}`)
  })
}

/** Renders the builder and picks a section, which is what loads the grid. */
async function openSection(user: ReturnType<typeof userEvent.setup>, over = {}) {
  wireApi(timetable(over))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<TimetableBuilder initialOptions={options as any} />)
  await user.selectOptions(screen.getByLabelText('Section'), 'section-1')
  await screen.findByRole('table')
}

const lesson = (over: Record<string, unknown> = {}) => ({
  id: 'lesson-1',
  dayOfWeek: 'MONDAY',
  period: 3,
  startTime: '09:10',
  endTime: '10:00',
  subjectId: 'subject-1',
  subjectName: 'Biology',
  sectionId: 'section-1',
  sectionName: 'A',
  className: '1st Year',
  divisionName: 'Boys',
  programName: 'Pre-Medical',
  room: 'Lab 1',
  ...over,
})

/* -------------------------------------------------------------------------- */
/* The admin builder                                                          */
/* -------------------------------------------------------------------------- */

describe('the master timetable builder', () => {
  const user = () => userEvent.setup()

  it('offers the college’s sessions, with the current one marked', async () => {
    wireApi()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TimetableBuilder initialOptions={options as any} />)
    const select = screen.getByLabelText('Academic session') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual([
      '2026-27 (current)',
      '2027-28',
    ])
    expect(select.value).toBe('session-1')
  })

  it('offers the sections of the chosen session, from the database', async () => {
    wireApi()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TimetableBuilder initialOptions={options as any} />)
    const select = screen.getByLabelText('Section') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'section-1'])
    expect(select.options[1]?.textContent).toContain('Pre-Medical')
  })

  it('drops a section from the previous session when the session changes', async () => {
    const u = user()
    await openSection(u)
    expect((screen.getByLabelText('Section') as HTMLSelectElement).value).toBe('section-1')

    await u.selectOptions(screen.getByLabelText('Academic session'), 'session-2')

    await waitFor(() => {
      const sections = screen.getByLabelText('Section') as HTMLSelectElement
      expect(sections.value).toBe('')
      expect([...sections.options].map((o) => o.value)).toEqual(['', 'section-2'])
    })
    // The other session's week must not still be on screen.
    expect(screen.queryByRole('table')).toBeNull()
    expect(get).toHaveBeenCalledWith('/api/v1/timetable/options?sessionId=session-2')
  })

  it('asks for a section before showing a grid', () => {
    wireApi()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TimetableBuilder initialOptions={options as any} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/Pick a section above/i)).toBeTruthy()
  })

  it('shows the college’s fixed periods, with their configured times', async () => {
    await openSection(user())
    const table = screen.getByRole('table')
    for (const period of PERIODS) {
      expect(within(table).getByText(`Period ${period.period}`)).toBeTruthy()
      expect(within(table).getByText(`${period.start}–${period.end}`)).toBeTruthy()
    }
  })

  it('marks the break in words and offers nothing in it', async () => {
    await openSection(user())
    const table = screen.getByRole('table')
    const breakCell = within(table).getByText(/Break — no classes are scheduled/i)
    expect(breakCell.getAttribute('aria-disabled')).toBe('true')

    for (const button of screen.getAllByRole('button', { name: /^Add a class on/i })) {
      expect(button.getAttribute('aria-label')).not.toMatch(/period 6$/)
    }
  })

  it('shows Add Class in an empty cell', async () => {
    await openSection(user())
    const adds = screen.getAllByRole('button', { name: /^Add a class on/i })
    expect(adds.length).toBe(8 * 6 - 1) // eight teaching periods, six days, one filled
    expect(adds[0]?.textContent).toContain('Add Class')
  })

  it('shows subject, teacher and room on a scheduled class', async () => {
    await openSection(user())
    const table = screen.getByRole('table')
    expect(within(table).getByText('Biology')).toBeTruthy()
    expect(within(table).getByText('Sara Khan')).toBeTruthy()
    expect(within(table).getByText('Room Lab 1')).toBeTruthy()
    expect(within(table).getByRole('button', { name: /^Edit Biology/ })).toBeTruthy()
    expect(within(table).getByRole('button', { name: /^Deactivate Biology/ })).toBeTruthy()
  })

  it('never shows a raw database id or a clock-time field', async () => {
    const u = user()
    await openSection(u)
    await u.click(screen.getAllByRole('button', { name: /^Add a class on/i })[0]!)

    expect(screen.queryByLabelText(/start time/i)).toBeNull()
    expect(screen.queryByLabelText(/end time/i)).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).not.toContain('subject-1')
    expect(dialog.textContent).not.toContain('staff-1')
    expect(dialog.textContent).not.toContain('session-1')
  })

  it('offers only the section’s curriculum, and only its assigned teachers', async () => {
    const u = user()
    await openSection(u, {
      subjects: [
        {
          subjectId: 'subject-1',
          subjectName: 'Biology',
          subjectCode: 'BIO',
          teachers: [{ staffId: 'staff-1', fullName: 'Sara Khan', staffCode: 'STF-0001' }],
        },
        {
          subjectId: 'subject-2',
          subjectName: 'Chemistry',
          subjectCode: 'CHEM',
          teachers: [{ staffId: 'staff-2', fullName: 'Imran Ali', staffCode: 'STF-0002' }],
        },
      ],
    })
    await u.click(screen.getAllByRole('button', { name: /^Add a class on/i })[0]!)

    const subjects = screen.getByLabelText(/^Subject/) as HTMLSelectElement
    expect([...subjects.options].map((o) => o.textContent)).toEqual([
      'Choose a subject',
      'Biology',
      'Chemistry',
    ])

    await u.selectOptions(subjects, 'subject-2')
    const teachers = screen.getByLabelText(/^Teacher/) as HTMLSelectElement
    // Only the teacher assigned to Chemistry in this section.
    expect([...teachers.options].map((o) => o.textContent)).toEqual([
      'Choose a teacher',
      'Imran Ali',
    ])
  })

  it('explains itself when nobody is assigned to the chosen subject', async () => {
    const u = user()
    await openSection(u, {
      subjects: [
        { subjectId: 'subject-3', subjectName: 'Physics', subjectCode: 'PHY', teachers: [] },
      ],
      slots: [],
    })
    await u.click(screen.getAllByRole('button', { name: /^Add a class on/i })[0]!)
    await u.selectOptions(screen.getByLabelText(/^Subject/), 'subject-3')

    expect(screen.getByText(/Nobody is assigned to this subject here/i)).toBeTruthy()
    expect((screen.getByLabelText(/^Teacher/) as HTMLSelectElement).disabled).toBe(true)
  })

  it('sends exactly what the create API accepts, and no times', async () => {
    const u = user()
    await openSection(u)
    post.mockResolvedValue({ id: 'slot-new' })

    await u.click(
      screen.getByRole('button', { name: 'Add a class on Tuesday, period 2' }),
    )
    await u.selectOptions(screen.getByLabelText(/^Subject/), 'subject-1')
    await u.selectOptions(screen.getByLabelText(/^Teacher/), 'staff-1')
    await u.type(screen.getByLabelText('Room'), '  Room 4  ')
    await u.click(screen.getByRole('button', { name: 'Add class' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('/api/v1/timetable')
    expect(body).toEqual({
      sectionId: 'section-1',
      subjectId: 'subject-1',
      staffId: 'staff-1',
      dayOfWeek: 'TUESDAY',
      period: 2,
      room: 'Room 4',
    })
    expect(Object.keys(body as object)).not.toContain('startTime')
    expect(Object.keys(body as object)).not.toContain('endTime')
    expect(Object.keys(body as object)).not.toContain('academicSessionId')
  })

  it('sends only the fields an edit may change', async () => {
    const u = user()
    await openSection(u)
    patch.mockResolvedValue({ id: 'slot-1' })

    await u.click(screen.getByRole('button', { name: /^Edit Biology/ }))
    await u.clear(screen.getByLabelText('Room'))
    await u.type(screen.getByLabelText('Room'), 'Room 7')
    await u.click(screen.getByRole('button', { name: 'Save class' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    const [url, body] = patch.mock.calls[0]!
    expect(url).toBe('/api/v1/timetable/slot-1')
    expect(body).toEqual({ subjectId: 'subject-1', staffId: 'staff-1', room: 'Room 7' })
    for (const forbidden of ['dayOfWeek', 'period', 'sectionId', 'academicSessionId', 'startTime', 'endTime']) {
      expect(Object.keys(body as object)).not.toContain(forbidden)
    }
  })

  it('reloads the week after a successful save', async () => {
    const u = user()
    await openSection(u)
    post.mockResolvedValue({ id: 'slot-new' })
    const before = get.mock.calls.filter((c) => String(c[0]).includes('/section')).length

    await u.click(screen.getByRole('button', { name: 'Add a class on Tuesday, period 2' }))
    await u.selectOptions(screen.getByLabelText(/^Subject/), 'subject-1')
    await u.selectOptions(screen.getByLabelText(/^Teacher/), 'staff-1')
    await u.click(screen.getByRole('button', { name: 'Add class' }))

    await waitFor(() => {
      const after = get.mock.calls.filter((c) => String(c[0]).includes('/section')).length
      expect(after).toBe(before + 1)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps what was typed when the save fails', async () => {
    const u = user()
    await openSection(u)
    post.mockRejectedValue(new ApiError('The server is unwell.', 500, 'INTERNAL_ERROR'))

    await u.click(screen.getByRole('button', { name: 'Add a class on Tuesday, period 2' }))
    await u.selectOptions(screen.getByLabelText(/^Subject/), 'subject-1')
    await u.selectOptions(screen.getByLabelText(/^Teacher/), 'staff-1')
    await u.type(screen.getByLabelText('Room'), 'Room 9')
    await u.click(screen.getByRole('button', { name: 'Add class' }))

    await screen.findByText('The server is unwell.')
    // The dialog is still open and nothing the user chose was thrown away.
    expect((screen.getByLabelText(/^Subject/) as HTMLSelectElement).value).toBe('subject-1')
    expect((screen.getByLabelText(/^Teacher/) as HTMLSelectElement).value).toBe('staff-1')
    expect((screen.getByLabelText('Room') as HTMLInputElement).value).toBe('Room 9')
  })

  it.each([
    ['staffId', 'Teacher is already scheduled during this period.'],
    ['room', 'Room is already occupied during this period.'],
    ['period', 'This section already has a class during this period.'],
  ])('turns a 409 on %s into a sentence', async (field, sentence) => {
    const u = user()
    await openSection(u)
    post.mockRejectedValue(
      new ApiError('constraint violated', 409, 'CONFLICT', { [field]: ['raw server wording'] }),
    )

    await u.click(screen.getByRole('button', { name: 'Add a class on Tuesday, period 2' }))
    await u.selectOptions(screen.getByLabelText(/^Subject/), 'subject-1')
    await u.selectOptions(screen.getByLabelText(/^Teacher/), 'staff-1')
    await u.click(screen.getByRole('button', { name: 'Add class' }))

    const shown = await screen.findAllByText(sentence)
    expect(shown.length).toBeGreaterThan(0)
    // Never the database's own words.
    expect(screen.queryByText(/constraint|prisma|unique index/i)).toBeNull()
  })

  it('confirms before deactivating, and never offers a delete', async () => {
    const u = user()
    await openSection(u)

    expect(screen.queryByRole('button', { name: /\bdelete\b/i })).toBeNull()

    await u.click(screen.getByRole('button', { name: /^Deactivate Biology/ }))
    expect(screen.getByText('Deactivate this timetable entry?')).toBeTruthy()
    expect(screen.getByText(/stays in the timetable’s history/i)).toBeTruthy()
    expect(del).not.toHaveBeenCalled()
  })

  it('deactivates through the API and reloads', async () => {
    const u = user()
    await openSection(u)
    del.mockResolvedValue({ deactivated: true })

    await u.click(screen.getByRole('button', { name: /^Deactivate Biology/ }))
    await u.click(screen.getByRole('button', { name: 'Deactivate entry' }))

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/v1/timetable/slot-1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says so when a deactivation fails, instead of pretending', async () => {
    const u = user()
    await openSection(u)
    del.mockRejectedValue(new ApiError('That lesson does not exist.', 404, 'NOT_FOUND'))

    await u.click(screen.getByRole('button', { name: /^Deactivate Biology/ }))
    await u.click(screen.getByRole('button', { name: 'Deactivate entry' }))

    await screen.findByText('That lesson does not exist.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shows a loading state while a week is being fetched', async () => {
    let release: (value: unknown) => void = () => {}
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/timetable/section')) {
        return new Promise((resolve) => {
          release = resolve
        })
      }
      return options
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TimetableBuilder initialOptions={options as any} />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Section'), 'section-1')

    expect(screen.queryByRole('table')).toBeNull()
    expect(document.querySelector('.animate-pulse')).not.toBeNull()

    release(timetable())
    await screen.findByRole('table')
  })

  it('says the load failed rather than showing an empty week', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/timetable/section')) {
        throw new ApiError('That section does not exist.', 404, 'NOT_FOUND')
      }
      return options
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TimetableBuilder initialOptions={options as any} />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Section'), 'section-1')

    await screen.findByText('That section does not exist.')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('explains an empty session instead of showing a blank picker', () => {
    wireApi()
    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <TimetableBuilder initialOptions={{ ...options, sections: [] } as any} />,
    )
    expect(screen.getByText(/No sections in this session/i)).toBeTruthy()
    expect((screen.getByLabelText('Section') as HTMLSelectElement).disabled).toBe(true)
  })

  it('explains a college with no sessions at all', () => {
    wireApi()
    render(
      <TimetableBuilder
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialOptions={{ sessions: [], selectedSessionId: null, currentSession: null, sections: [] } as any}
      />,
    )
    expect(screen.getByText(/No academic session yet/i)).toBeTruthy()
  })

  it('will not offer Add Class where there is no curriculum', async () => {
    const u = user()
    await openSection(u, { subjects: [], slots: [] })
    expect(screen.getByText(/no curriculum yet/i)).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: /^Add a class on/i })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The teacher's own week                                                     */
/* -------------------------------------------------------------------------- */

describe('a teacher’s own timetable', () => {
  const week = (over: Record<string, unknown> = {}) =>
    ({
      sessionName: '2026-27',
      periods: PERIODS,
      lessons: [lesson()],
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  it('shows the class, section, subject and time of each lesson', () => {
    render(<TeacherTimetableGrid timetable={week()} />)
    // Rendered twice — a stack for phones and a grid above `md` — so both
    // layouts are asserted through getAllBy.
    expect(screen.getAllByText('Biology').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1st Year/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Section A/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Lab 1/).length).toBeGreaterThan(0)
    expect(within(screen.getByRole('table')).getByText('09:10–10:00')).toBeTruthy()
  })

  it('marks the break rather than leaving a blank line', () => {
    render(<TeacherTimetableGrid timetable={week()} />)
    expect(within(screen.getByRole('table')).getByText('Break')).toBeTruthy()
  })

  it('offers nothing that would change the timetable', () => {
    render(<TeacherTimetableGrid timetable={week()} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(post).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('says nothing is timetabled rather than showing an empty grid', () => {
    render(<TeacherTimetableGrid timetable={week({ lessons: [] })} />)
    expect(screen.getByText(/No lessons timetabled yet/i)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Today's classes                                                            */
/* -------------------------------------------------------------------------- */

describe('today’s classes on the teacher dashboard', () => {
  const today = (over: Record<string, unknown> = {}) =>
    ({
      date: '2026-09-07',
      dayOfWeek: 'MONDAY',
      lessons: [lesson(), lesson({ id: 'lesson-2', period: 7, startTime: '11:40', endTime: '12:10', subjectName: 'Chemistry' })],
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  it('names the day it is showing', () => {
    render(<TodayClassesCard today={today()} />)
    expect(screen.getByText(/Monday · 2026-09-07/)).toBeTruthy()
  })

  it('lists each lesson in period order, with its time and section', () => {
    render(<TodayClassesCard today={today()} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('09:10')).toBeTruthy()
    expect(within(items[0]!).getByText('Biology')).toBeTruthy()
    expect(within(items[0]!).getByText(/Section A/)).toBeTruthy()
    expect(within(items[1]!).getByText('Chemistry')).toBeTruthy()
    expect(within(items[1]!).getByText('Period 7')).toBeTruthy()
  })

  it('says the day is empty rather than falling back to the whole week', () => {
    render(<TodayClassesCard today={today({ lessons: [] })} />)
    expect(screen.getByText(/Nothing timetabled today/i)).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('links to the full week and nowhere else', () => {
    render(<TodayClassesCard today={today()} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe('/staff/timetable')
  })
})

/* -------------------------------------------------------------------------- */
/* Product scope                                                              */
/* -------------------------------------------------------------------------- */

describe('there is no student timetable', () => {
  it('offers a student no timetable anywhere in their navigation', () => {
    const hrefs = NAVIGATION.STUDENT.flatMap((s) => s.items).map((i) => i.href)
    expect(hrefs.some((h) => h.includes('timetable'))).toBe(false)
    const labels = NAVIGATION.STUDENT.flatMap((s) => s.items).map((i) => i.label)
    expect(labels.some((l) => /timetable/i.test(l))).toBe(false)
  })

  it('gives the admin the master timetable and the teacher their own', () => {
    const adminHrefs = NAVIGATION.ADMIN.flatMap((s) => s.items).map((i) => i.href)
    expect(adminHrefs).toContain('/admin/timetable')

    const staffItems = NAVIGATION.STAFF.flatMap((s) => s.items)
    const staffTimetable = staffItems.find((i) => i.href === '/staff/timetable')
    expect(staffTimetable).toBeTruthy()
    // No longer a greyed-out promise.
    expect(staffTimetable?.comingSoon).toBeUndefined()
  })
})

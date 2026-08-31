// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

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

const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, patch, put: vi.fn(), delete: del } }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TimetableBuilder } = await import('@/features/timetable/timetable-builder')
const { TeacherTimetableGrid } = await import('@/features/timetable/teacher-timetable')
const { TodayClassesCard } = await import('@/features/timetable/today-classes')
const { NAVIGATION } = await import('@/components/layout/nav-config')
const { PERIODS } = await import('@/server/timetable/periods')

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

const options = {
  currentSession: { id: 'session-1', name: '2026-27' },
  sections: [section],
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
  it('shows the college grid, with the break as the break', () => {
    render(<TimetableBuilder options={options} timetable={timetable()} />)

    const table = screen.getByRole('table')
    // Nine periods, one of which is the break.
    for (const period of PERIODS) {
      expect(within(table).getByText(`${period.start}–${period.end}`)).toBeTruthy()
    }
    expect(within(table).getByText('Break')).toBeTruthy()
  })

  it('offers no way to put a lesson in the break', () => {
    render(<TimetableBuilder options={options} timetable={timetable()} />)

    // Every "Add" button names its period; none of them names period 6.
    const adds = screen.getAllByRole('button', { name: /^Add a lesson on/i })
    expect(adds.length).toBeGreaterThan(0)
    for (const button of adds) {
      expect(button.getAttribute('aria-label')).not.toMatch(/period 6$/)
    }
  })

  it('shows a scheduled lesson with its teacher and room', () => {
    render(<TimetableBuilder options={options} timetable={timetable()} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Biology')).toBeTruthy()
    expect(within(table).getByText(/Sara Khan/)).toBeTruthy()
    expect(within(table).getByText(/Lab 1/)).toBeTruthy()
  })

  it('says so when the section has no curriculum, instead of offering subjects', () => {
    render(<TimetableBuilder options={options} timetable={timetable({ subjects: [], slots: [] })} />)
    expect(screen.getByText(/no curriculum yet/i)).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: /^Add a lesson on/i })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('asks for a section before showing a grid', () => {
    render(<TimetableBuilder options={options} timetable={null} />)
    expect(screen.queryByRole('table')).toBeNull()
    // "Choose a section" is also the select's placeholder, so assert the
    // empty state's own sentence rather than the ambiguous heading.
    expect(screen.getByText(/Pick a section above/i)).toBeTruthy()
  })

  it('explains itself when there is no current session', () => {
    render(
      <TimetableBuilder options={{ currentSession: null, sections: [] }} timetable={null} />,
    )
    expect(screen.getByText(/No current academic session/i)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
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

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 22 screens: the office's register sends exactly the marks it shows,
 * a day it may not touch offers no buttons, the month explains how leave is
 * counted, and a staff member's own card shows their own days.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
const put = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put, patch: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { StaffRegister } = await import('@/features/staff-attendance/staff-register')
const { StaffAttendanceMonthView } = await import('@/features/staff-attendance/staff-attendance-month')
const { MyAttendanceCard } = await import('@/features/staff-attendance/my-attendance-card')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const A = '88888888-8888-4888-8888-888888888881'
const B = '88888888-8888-4888-8888-888888888882'

const row = (staffId: string, fullName: string, staffCode: string) => ({
  staffId,
  staffCode,
  fullName,
  designation: 'Lecturer',
  department: 'Science',
  staffType: 'TEACHING',
  photoId: null,
  status: null as null | 'PRESENT' | 'ABSENT' | 'SHORT_LEAVE' | 'LEAVE',
  remarks: null as string | null,
})

const day = {
  date: '2026-09-08',
  editable: true,
  reason: null,
  counts: { present: 0, absent: 0, shortLeave: 0, leave: 0, marked: 0 },
  unmarked: 2,
  rows: [row(A, 'Sara Khan', 'STF-0001'), row(B, 'Imran Ali', 'STF-0002')],
  departments: [{ id: '77777777-7777-4777-8777-777777777771', name: 'Science' }],
}

describe('the day’s register', () => {
  it('offers all four statuses for every staff member', () => {
    render(<StaffRegister day={day} canMark />)
    expect(screen.getByRole('radio', { name: /Present — Sara Khan/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Short leave — Sara Khan/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Leave — Imran Ali/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Absent — Imran Ali/ })).toBeTruthy()
  })

  it('sends only the people who were marked, with the date the server gave', async () => {
    put.mockResolvedValue({ ...day, rows: [{ ...day.rows[0]!, status: 'PRESENT' }, day.rows[1]!] })
    const user = userEvent.setup()
    render(<StaffRegister day={day} canMark />)

    await user.click(screen.getByRole('radio', { name: /Present — Sara Khan/ }))
    await user.click(screen.getByRole('button', { name: /Save register/ }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0]).toBe('/api/v1/staff-attendance')
    expect(put.mock.calls[0]![1]).toEqual({ date: '2026-09-08', entries: [{ staffId: A, status: 'PRESENT' }] })
  })

  it('“All present” fills every row, and each can still be changed', async () => {
    put.mockResolvedValue(day)
    const user = userEvent.setup()
    render(<StaffRegister day={day} canMark />)

    await user.click(screen.getByRole('button', { name: /All present/ }))
    await user.click(screen.getByRole('radio', { name: /Absent — Imran Ali/ }))
    await user.click(screen.getByRole('button', { name: /Save register/ }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![1].entries).toEqual([
      { staffId: A, status: 'PRESENT' },
      { staffId: B, status: 'ABSENT' },
    ])
  })

  it('cannot be saved until something changes', () => {
    render(<StaffRegister day={{ ...day, rows: [{ ...day.rows[0]!, status: 'PRESENT' }] }} canMark />)
    expect(screen.getByRole('button', { name: /Save register/ }).hasAttribute('disabled')).toBe(true)
  })

  it('gives a day it may not mark no save bar and no working buttons, and says why', () => {
    render(<StaffRegister day={{ ...day, editable: false, reason: 'Staff attendance cannot be marked for a future date.' }} canMark />)
    expect(screen.getByText(/future date/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save register/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Present — Sara Khan/ }).hasAttribute('disabled')).toBe(true)
  })

  it('lets someone who may only look, look — and tells them so', () => {
    render(<StaffRegister day={day} canMark={false} />)
    expect(screen.getByText(/can see the staff register but not change it/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save register/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /All present/ })).toBeNull()
  })
})

describe('the month', () => {
  const month = {
    month: '2026-09-01',
    monthLabel: 'September 2026',
    daysMarked: 4,
    rows: [
      { staffId: A, staffCode: 'STF-0001', fullName: 'Sara Khan', designation: 'Lecturer', department: 'Science', counts: { present: 3, absent: 0, shortLeave: 0, leave: 1, marked: 4 }, percentage: 100 },
      { staffId: B, staffCode: 'STF-0002', fullName: 'Imran Ali', designation: 'Lecturer', department: 'Science', counts: { present: 1, absent: 2, shortLeave: 1, leave: 0, marked: 4 }, percentage: 50 },
      { staffId: '88888888-8888-4888-8888-888888888883', staffCode: 'STF-0003', fullName: 'Nadia Sohail', designation: 'Clerk', department: null, counts: { present: 0, absent: 0, shortLeave: 0, leave: 0, marked: 0 }, percentage: null },
    ],
    departments: [],
  }

  it('shows each person’s counts and their worked percentage in figures and words', () => {
    render(<StaffAttendanceMonthView month={month} />)
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('Sara Khan')).toBeTruthy()
    // Nobody marked: a dash, not a nought that would read as an absence record.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('says in words that approved leave is left out of the percentage', () => {
    render(<StaffAttendanceMonthView month={month} />)
    expect(screen.getByText(/left out of the percentage/)).toBeTruthy()
  })
})

describe('a staff member’s own card', () => {
  const mine = {
    month: '2026-09-01',
    monthLabel: 'September 2026',
    counts: { present: 2, absent: 1, shortLeave: 1, leave: 1, marked: 5 },
    percentage: 75,
    days: [
      { date: '2026-09-01', status: 'PRESENT' as const, remarks: null },
      { date: '2026-09-02', status: 'SHORT_LEAVE' as const, remarks: 'Left after third period' },
      { date: '2026-09-03', status: 'LEAVE' as const, remarks: null },
    ],
  }

  it('shows their month, their days and their percentage', () => {
    render(<MyAttendanceCard attendance={mine} />)
    expect(screen.getByText('My attendance')).toBeTruthy()
    expect(screen.getByText('September 2026')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('Left after third period')).toBeTruthy()
    expect(screen.getAllByText('Leave').length).toBeGreaterThan(0)
  })

  it('says plainly when the office has not taken the register yet', () => {
    render(<MyAttendanceCard attendance={{ ...mine, counts: { present: 0, absent: 0, shortLeave: 0, leave: 0, marked: 0 }, percentage: null, days: [] }} />)
    expect(screen.getByText(/has not taken the staff register/)).toBeTruthy()
  })
})

describe('finding it', () => {
  it('sits under People for the office, and is not offered to anybody else', () => {
    const people = NAVIGATION.ADMIN.find((g) => g.title === 'People')
    expect(people?.items.some((i) => i.href === '/admin/staff-attendance' && i.label === 'Staff Attendance')).toBe(true)
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(NAVIGATION[role].some((g) => g.items.some((i) => i.href.startsWith('/admin/staff-attendance')))).toBe(false)
    }
  })
})

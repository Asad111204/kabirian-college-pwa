// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  DateRange,
  DateSheetBadge,
  ExamStatusBadge,
  formatExamDate,
  formatMarks,
  formatTimeRange,
  programLabel,
} from '@/features/exams/shared'
import { DateSheetView } from '@/features/exams/date-sheet-view'
import { buildDateSheet, type ScheduledPaper } from '@/server/exams/exam-policy'

/**
 * The exam UI pieces.
 *
 * These test the parts that carry a *rule*: that a status is never communicated
 * by colour alone, that a date sheet shows the day it was actually set for, and
 * that a paper the whole class sits is labelled honestly rather than left blank.
 */

// `globals: false` means Testing Library does not register its own cleanup, so
// each test would otherwise render on top of the previous one's DOM.
afterEach(cleanup)

describe('exam status badges', () => {
  it('names each status in words, not only in colour', () => {
    for (const [status, label] of [
      ['DRAFT', 'Draft'],
      ['SCHEDULED', 'Scheduled'],
      ['MARKS_ENTRY', 'Marks entry'],
      ['COMPLETED', 'Completed'],
      ['CANCELLED', 'Cancelled'],
    ] as const) {
      const { unmount } = render(<ExamStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
      unmount()
    }
  })

  it('says in words whether the date sheet is published', () => {
    const { unmount } = render(<DateSheetBadge published />)
    expect(screen.getByText('Published')).toBeTruthy()
    unmount()

    render(<DateSheetBadge published={false} />)
    expect(screen.getByText('Not published')).toBeTruthy()
  })
})

describe('the date on a date sheet', () => {
  it('shows the day the exam was actually set for', () => {
    // Formatted in UTC on purpose: `new Date('2026-05-10')` is UTC midnight and
    // would display as 09 May for any reader west of Greenwich.
    expect(formatExamDate('2026-05-10')).toBe('10 May 2026')
    expect(formatExamDate('2026-01-01')).toBe('01 Jan 2026')
    expect(formatExamDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('shows a dash rather than guessing when there is no date', () => {
    expect(formatExamDate(null)).toBe('—')
    expect(formatExamDate('')).toBe('—')
    expect(formatExamDate('not a date')).toBe('—')
  })

  it('renders a range, a single day, or nothing set', () => {
    const { unmount } = render(<DateRange from="2026-05-10" to="2026-05-20" />)
    expect(screen.getByText(/10 May 2026 – 20 May 2026/)).toBeTruthy()
    unmount()

    const single = render(<DateRange from="2026-05-10" to="2026-05-10" />)
    expect(screen.getByText('10 May 2026')).toBeTruthy()
    single.unmount()

    render(<DateRange from={null} to={null} />)
    expect(screen.getByText('Not set')).toBeTruthy()
  })
})

describe('times and marks', () => {
  it('shows a range when there is one, and the start alone otherwise', () => {
    expect(formatTimeRange('09:00', '12:00')).toBe('09:00 – 12:00')
    expect(formatTimeRange('09:00', null)).toBe('09:00')
    expect(formatTimeRange(null, null)).toBe('—')
  })

  it('does not show pointless decimals on a whole mark', () => {
    expect(formatMarks('100.00')).toBe('100')
    expect(formatMarks('87.50')).toBe('87.50')
  })
})

describe('a paper the whole class sits', () => {
  it('is labelled, not left blank', () => {
    expect(programLabel(null)).toBe('All programmes')
    expect(programLabel('Pre-Medical')).toBe('Pre-Medical')
  })
})

/* -------------------------------------------------------------------------- */

function paper(over: Partial<ScheduledPaper> = {}): ScheduledPaper {
  return {
    id: 'p1',
    classId: 'class-1',
    className: '1st Year',
    programId: 'premed',
    programName: 'Pre-Medical',
    subjectId: 'biology',
    subjectName: 'Biology',
    examDate: '2026-05-14',
    startTime: '09:00',
    endTime: '12:00',
    room: null,
    maxMarks: '100.00',
    ...over,
  }
}

describe('the date sheet', () => {
  it('says so plainly when nothing is scheduled', () => {
    render(<DateSheetView groups={[]} />)
    expect(screen.getByText('Nothing scheduled yet')).toBeTruthy()
  })

  it('heads each schedule with its class and programme', () => {
    render(<DateSheetView groups={buildDateSheet([paper()])} />)
    expect(screen.getByText('1st Year — Pre-Medical')).toBeTruthy()
    expect(screen.getByText('1 paper')).toBeTruthy()
  })

  it('lists the papers in date order', () => {
    render(
      <DateSheetView
        groups={buildDateSheet([
          paper({ id: 'p1', subjectName: 'Biology', examDate: '2026-05-14' }),
          paper({
            id: 'p2',
            subjectId: 'chemistry',
            subjectName: 'Chemistry',
            examDate: '2026-05-12',
          }),
        ])}
      />,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Chemistry')
    expect(rows[1]?.textContent).toContain('Biology')
  })

  it('shows a shared paper on every programme’s schedule', () => {
    render(
      <DateSheetView
        groups={buildDateSheet([
          paper({ id: 'p1' }),
          paper({
            id: 'p2',
            programId: 'preeng',
            programName: 'Pre-Engineering',
            subjectId: 'maths',
            subjectName: 'Mathematics',
          }),
          paper({
            id: 'p3',
            programId: null,
            programName: null,
            subjectId: 'english',
            subjectName: 'English',
            examDate: '2026-05-10',
          }),
        ])}
      />,
    )
    expect(screen.getByText('1st Year — Pre-Medical')).toBeTruthy()
    expect(screen.getByText('1st Year — Pre-Engineering')).toBeTruthy()
    // English appears once per programme, because both sit it.
    expect(screen.getAllByText('English')).toHaveLength(2)
  })

  it('does not hide a paper that has no date yet', () => {
    render(
      <DateSheetView groups={buildDateSheet([paper({ examDate: null, startTime: null })])} />,
    )
    expect(screen.getByText('Biology')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

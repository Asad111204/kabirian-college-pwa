// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  AttendanceBar,
  BreakdownTable,
  Percentage,
  SummaryTiles,
  type BreakdownRow,
} from '@/features/attendance/report-shared'

/**
 * The report presentation.
 *
 * The rule worth locking down is that zero counted sessions is never shown as
 * 0% — anywhere. A report that says a class attends 0% when no classes have been
 * held is worse than one that says nothing.
 */

afterEach(cleanup)

const summary = (present = 0, absent = 0, late = 0, leave = 0, percentage: number | null = null) => ({
  present,
  absent,
  late,
  leave,
  total: present + absent + late + leave,
  attended: present + late,
  percentage,
})

const row = (label: string, s: ReturnType<typeof summary>, extra: Partial<BreakdownRow> = {}): BreakdownRow => ({
  id: label,
  label,
  sheets: 1,
  ...s,
  ...extra,
})

describe('showing a percentage', () => {
  it('shows the number the server calculated', () => {
    render(<Percentage value={87.5} />)
    expect(screen.getByText('87.5%')).toBeTruthy()
  })

  it('never shows 0% for zero counted sessions', () => {
    render(<Percentage value={null} />)
    expect(screen.getByText('No attendance yet')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('does show a genuine 0%', () => {
    // Everyone absent is a real 0% and must not be hidden.
    render(<Percentage value={0} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })
})

describe('the summary tiles', () => {
  it('show each count and the overall figure', () => {
    render(<SummaryTiles summary={summary(6, 1, 1, 1, 77.8)} />)
    expect(screen.getByText('77.8%')).toBeTruthy()
    expect(screen.getByText('7 of 9 attended')).toBeTruthy()
  })

  it('say so plainly when nothing has been recorded', () => {
    render(<SummaryTiles summary={summary()} />)
    expect(screen.getByText('No attendance recorded yet')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('include extra figures the caller passes', () => {
    render(<SummaryTiles summary={summary(1)} extra={[{ label: 'Registers', value: 5 }]} />)
    expect(screen.getByText('Registers')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })
})

describe('the breakdown table', () => {
  const rows = [
    row('1st Year', summary(5, 1, 1, 1, 75)),
    row('2nd Year', summary(1, 0, 0, 0, 100)),
  ]

  it('lists each group with its own figures', () => {
    render(<BreakdownTable title="By class" firstColumn="Class" rows={rows} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('1st Year')).toBeTruthy()
    expect(within(table).getByText('75%')).toBeTruthy()
    expect(within(table).getByText('100%')).toBeTruthy()
  })

  it('shows the extra context a section row carries', () => {
    render(
      <BreakdownTable
        title="By section"
        firstColumn="Section"
        rows={[row('Section A', summary(1), { detail: '1st Year · Boys · Pre-Medical' })]}
      />,
    )
    expect(screen.getByText('1st Year · Boys · Pre-Medical')).toBeTruthy()
  })

  it('says when a filter matched nothing', () => {
    render(<BreakdownTable title="By class" firstColumn="Class" rows={[]} />)
    expect(screen.getByText('No attendance matches these filters')).toBeTruthy()
  })

  it('uses the caller’s wording for an empty subject table', () => {
    render(
      <BreakdownTable
        title="By subject"
        firstColumn="Subject"
        rows={[]}
        emptyMessage="No subject attendance in this selection"
      />,
    )
    expect(screen.getByText('No subject attendance in this selection')).toBeTruthy()
  })

  it('names daily roll call as itself, never as a subject', () => {
    render(
      <BreakdownTable
        title="By subject"
        firstColumn="Subject"
        rows={[row('Daily roll call', summary(2, 0, 0, 0, 100))]}
      />,
    )
    expect(screen.getByText('Daily roll call')).toBeTruthy()
  })
})

describe('the attendance bar', () => {
  it('describes itself for a screen reader rather than relying on colour', () => {
    render(<AttendanceBar summary={summary(6, 1, 1, 1)} />)
    const bar = screen.getByRole('img')
    expect(bar.getAttribute('aria-label')).toContain('6 present')
    expect(bar.getAttribute('aria-label')).toContain('1 absent')
  })

  it('draws nothing when there is nothing to draw', () => {
    const { container } = render(<AttendanceBar summary={summary()} />)
    expect(container.querySelector('[role="img"]')).toBeNull()
  })
})

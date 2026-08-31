// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AttendanceSummaryTiles,
  CountsSummary,
  SheetStatusBadge,
  StatusPicker,
  subjectLabel,
} from '@/features/attendance/shared'
import type { AttendanceStatusValue } from '@/features/attendance/shared'

/**
 * The attendance UI pieces.
 *
 * These test the parts that carry a *rule*: that a status is never communicated
 * by colour alone, that a percentage is shown the way the server reported it,
 * and that a register with no counted sessions says so rather than claiming 0%.
 */

// `globals: false` means Testing Library does not register its own cleanup, so
// each test would otherwise render on top of the previous one's DOM.
afterEach(cleanup)

const counts = (present = 0, absent = 0, late = 0, leave = 0) => ({ present, absent, late, leave })

describe('sheet status badges', () => {
  it('names each status in words, not only in colour', () => {
    for (const [status, label] of [
      ['DRAFT', 'Draft'],
      ['SUBMITTED', 'Submitted'],
      ['CANCELLED', 'Cancelled'],
    ] as const) {
      const { unmount } = render(<SheetStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
      unmount()
    }
  })
})

describe('the subject column', () => {
  it('names the subject for a subject register', () => {
    expect(subjectLabel('Biology')).toBe('Biology')
  })

  it('says "Daily roll call" when there is no subject', () => {
    expect(subjectLabel(null)).toBe('Daily roll call')
  })
})

describe('the summary at the top of a register', () => {
  it('shows each count', () => {
    render(
      <AttendanceSummaryTiles
        counts={counts(27, 2, 1, 0)}
        total={30}
        percentage={93.3}
        countsTowardsPercentage
      />,
    )
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('27')).toBeTruthy()
    expect(screen.getByText('93.3%')).toBeTruthy()
  })

  it('shows the percentage the server calculated, and does not recompute it', () => {
    // 16 present + 2 late of 20 is 90% by the college's rule. If this component
    // did its own arithmetic it would be far too easy to use a different one.
    render(
      <AttendanceSummaryTiles
        counts={counts(16, 2, 2, 0)}
        total={20}
        percentage={90}
        countsTowardsPercentage
      />,
    )
    expect(screen.getByText('90%')).toBeTruthy()
  })

  it('says "No attendance recorded yet" rather than 0%', () => {
    render(
      <AttendanceSummaryTiles
        counts={counts()}
        total={0}
        percentage={null}
        countsTowardsPercentage
      />,
    )
    expect(screen.getByText('No attendance recorded yet')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('says a draft is not counted yet', () => {
    render(
      <AttendanceSummaryTiles
        counts={counts(30)}
        total={30}
        percentage={100}
        countsTowardsPercentage={false}
      />,
    )
    expect(screen.getByText('Not counted yet')).toBeTruthy()
    expect(screen.queryByText('100%')).toBeNull()
  })
})

describe('the counts column in the list', () => {
  it('shows a dash when nothing has been marked', () => {
    render(<CountsSummary counts={counts()} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('labels each figure for a screen reader', () => {
    render(<CountsSummary counts={counts(27, 2, 1, 0)} />)
    // The number is visible; the word is there for assistive technology.
    expect(screen.getByText('Present', { exact: false })).toBeTruthy()
    expect(screen.getByText('Absent', { exact: false })).toBeTruthy()
  })

  it('leaves out statuses with no students', () => {
    render(<CountsSummary counts={counts(30)} />)
    expect(screen.queryByText('Leave', { exact: false })).toBeNull()
  })
})

describe('marking a student', () => {
  it('offers all four statuses as radio buttons', () => {
    render(<StatusPicker value="PRESENT" onChange={() => {}} studentName="Ali Raza" />)
    const group = screen.getByRole('radiogroup', { name: /Ali Raza/ })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
  })

  it('marks the current status as checked', () => {
    render(<StatusPicker value="ABSENT" onChange={() => {}} studentName="Ali Raza" />)
    expect(screen.getByRole('radio', { name: /Absent/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Present/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('names the student on every option, so a screen reader is unambiguous', () => {
    render(<StatusPicker value="PRESENT" onChange={() => {}} studentName="Ali Raza" />)
    for (const label of ['Present', 'Absent', 'Late', 'Leave']) {
      expect(screen.getByRole('radio', { name: new RegExp(`${label}.*Ali Raza`) })).toBeTruthy()
    }
  })

  it('reports the chosen status back', async () => {
    const chosen: AttendanceStatusValue[] = []
    render(
      <StatusPicker value="PRESENT" onChange={(s) => chosen.push(s)} studentName="Ali Raza" />,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Late/ }))
    expect(chosen).toEqual(['LATE'])
  })

  it('changes nothing on its own — the parent owns the value', async () => {
    render(<StatusPicker value="PRESENT" onChange={() => {}} studentName="Ali Raza" />)
    await userEvent.click(screen.getByRole('radio', { name: /Absent/ }))
    // Still Present, because the caller did not accept the change.
    expect(screen.getByRole('radio', { name: /Present/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('cannot be used when the register is read-only', async () => {
    const chosen: AttendanceStatusValue[] = []
    render(
      <StatusPicker
        value="PRESENT"
        onChange={(s) => chosen.push(s)}
        studentName="Ali Raza"
        disabled
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Absent/ }))
    expect(chosen).toEqual([])
  })
})

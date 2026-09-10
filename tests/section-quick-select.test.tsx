// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Ticking a whole year at once.
 *
 * Some subjects belong to everybody — English is taken by every section of 1st
 * Year — and putting a teacher against one meant ticking twelve boxes. These
 * check that a year goes on in one press, that pressing again takes it off,
 * that a campus can be taken on its own, and that the buttons are built from
 * whatever classes the college actually has rather than from a hard-coded list.
 */

const { SectionQuickSelect } = await import('@/features/academics/section-quick-select')

/** The college as it stands: two years, two campuses, six programmes each. */
const COLLEGE = [
  ...['PM', 'PE', 'ICS-P', 'ICS-E', 'FA', 'FAIT'].map((p) => ({
    id: `y1-boys-${p}`,
    className: '1st Year',
    divisionName: 'Boys',
  })),
  ...['PM', 'PE', 'ICS-P', 'ICS-E', 'FA', 'FAIT'].map((p) => ({
    id: `y1-girls-${p}`,
    className: '1st Year',
    divisionName: 'Girls',
  })),
  ...['PM', 'PE', 'ICS-P', 'ICS-E', 'FA', 'FAIT'].map((p) => ({
    id: `y2-boys-${p}`,
    className: '2nd Year',
    divisionName: 'Boys',
  })),
]

afterEach(cleanup)

function show(selected: string[] = []) {
  const onChange = vi.fn()
  render(<SectionQuickSelect sections={COLLEGE} selected={selected} onChange={onChange} />)
  return onChange
}

describe('ticking a whole year at once', () => {
  it('offers a button for each year the college has', () => {
    show()
    expect(screen.getByRole('button', { name: 'All 1st Year' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All 2nd Year' })).toBeTruthy()
  })

  it('takes every section of that year in one press', async () => {
    const onChange = show()
    await userEvent.setup().click(screen.getByRole('button', { name: 'All 1st Year' }))
    const chosen = onChange.mock.calls[0]![0] as string[]
    expect(chosen).toHaveLength(12)
    expect(chosen.every((id) => id.startsWith('y1-'))).toBe(true)
  })

  it('offers a campus on its own, when the year has more than one', () => {
    show()
    expect(screen.getByRole('button', { name: '1st Year Girls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1st Year Boys' })).toBeTruthy()
  })

  it('does not offer a campus button for a year that only has one', () => {
    // 2nd Year is boys-only here, so "All 2nd Year" already says everything.
    show()
    expect(screen.queryByRole('button', { name: '2nd Year Boys' })).toBeNull()
  })

  it('takes one campus without touching the other', async () => {
    const onChange = show()
    await userEvent.setup().click(screen.getByRole('button', { name: '1st Year Girls' }))
    const chosen = onChange.mock.calls[0]![0] as string[]
    expect(chosen).toHaveLength(6)
    expect(chosen.every((id) => id.startsWith('y1-girls-'))).toBe(true)
  })

  it('presses off again when the whole set is already on', async () => {
    const all1st = COLLEGE.filter((s) => s.className === '1st Year').map((s) => s.id)
    const onChange = show(all1st)
    await userEvent.setup().click(screen.getByRole('button', { name: 'All 1st Year' }))
    expect(onChange.mock.calls[0]![0]).toEqual([])
  })

  it('shows a year as on only when every one of its sections is', () => {
    const allBut1 = COLLEGE.filter((s) => s.className === '1st Year')
      .map((s) => s.id)
      .slice(1)
    show(allBut1)
    expect(screen.getByRole('button', { name: 'All 1st Year' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps what was already chosen elsewhere', async () => {
    const onChange = show(['y2-boys-PM'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'All 1st Year' }))
    expect(onChange.mock.calls[0]![0]).toContain('y2-boys-PM')
  })

  it('clears everything when asked, and offers nothing to clear when nothing is on', async () => {
    expect(screen.queryByRole('button', { name: 'clear' })).toBeNull()
    const onChange = show(['y1-boys-PM'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'clear' }))
    expect(onChange.mock.calls[0]![0]).toEqual([])
  })

  it('shows nothing at all when the session has no sections', () => {
    const { container } = render(<SectionQuickSelect sections={[]} selected={[]} onChange={vi.fn()} />)
    expect(container.textContent).toBe('')
  })
})

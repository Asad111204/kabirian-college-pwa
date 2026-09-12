// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The handbook: a document rather than a screen. It has to carry the college's
 * mark, cover every part of the system, and keep the reader's button off the
 * paper.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/handbook' }))

const { HandbookDocument } = await import('@/features/handbook/handbook-document')
const { HANDBOOK_PARTS } = await import('@/features/handbook/handbook-content')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const render_ = () => render(<HandbookDocument collegeName="Nova School Kamalia" sessionName="2026-27" />)

describe('the cover', () => {
  it('carries the college’s own logo, its name and the year', () => {
    render_()
    // The wordmark on the cover and the closing page, the small mark on each
    // part: every one of them the college's own file.
    const logos = screen.getAllByRole('img')
    expect(logos.length).toBeGreaterThan(2)
    // Next rewrites the path through its image optimiser, so the check is on
    // the file it points at rather than on a literal path.
    expect(logos.every((img) => (img.getAttribute('src') ?? '').includes('logo'))).toBe(true)
    expect(screen.getAllByText('Nova School Kamalia').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-27')).toBeTruthy()
  })

  it('says how many parts it covers, and lists them', () => {
    render_()
    expect(screen.getByText(`${HANDBOOK_PARTS.length} parts`)).toBeTruthy()
    expect(screen.getByText('Contents')).toBeTruthy()
    for (const part of HANDBOOK_PARTS) {
      expect(screen.getAllByText(part.title).length).toBeGreaterThan(0)
    }
  })

  it('says plainly when the college has no current session', () => {
    render(<HandbookDocument collegeName="Nova School Kamalia" sessionName={null} />)
    expect(screen.getByText('Not set')).toBeTruthy()
  })
})

describe('the parts', () => {
  it('explains every corner of the system', () => {
    render_()
    for (const title of [
      'Signing in, and your account',
      'The academic structure',
      'Admitting a student',
      'Attendance',
      'Exams, marks and results',
      'Fees',
      'Finance',
      'Notifications',
      'The audit log',
      'Erasing a record',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    }
  })

  it('says where each part lives in the app', () => {
    render_()
    expect(screen.getByText(/Where: Admin, Fees/)).toBeTruthy()
    expect(screen.getByText(/Where: Admin, Audit Log/)).toBeTruthy()
  })

  it('gives the rules with the reason for each, not just the rule', () => {
    render_()
    expect(screen.getAllByText('Rules the system keeps').length).toBeGreaterThan(0)
    expect(screen.getByText(/Every amount is a whole number of paisa/)).toBeTruthy()
    expect(screen.getByText(/round differently in different places/)).toBeTruthy()
  })

  it('walks through the procedures that have steps', () => {
    render_()
    expect(screen.getAllByText('Step by step').length).toBeGreaterThan(0)
    expect(screen.getByText('Press Issue vouchers, then Check first.')).toBeTruthy()
  })
})

describe('as paper', () => {
  it('keeps the reader’s button and its advice off the page', () => {
    const { container } = render_()
    const button = screen.getByRole('button', { name: /Print or save as PDF/ })
    expect(button.closest('.print-hide')).not.toBeNull()
    expect(container.querySelector('.print-area')).not.toBeNull()
  })

  it('gives every part its own sheet', () => {
    const { container } = render_()
    // A cover, a contents page, one per part, and a closing page.
    expect(container.querySelectorAll('.handbook-page').length).toBe(HANDBOOK_PARTS.length + 3)
  })

  it('opens the browser’s own print dialogue', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { writable: true, value: print })
    const user = userEvent.setup()
    render_()

    await user.click(screen.getByRole('button', { name: /Print or save as PDF/ }))
    expect(print).toHaveBeenCalled()
  })
})

describe('what it says', () => {
  it('describes rules that are actually true of this system', () => {
    // Spot checks against decisions taken in earlier phases: if one of these
    // ever changes, the handbook has to change with it.
    const text = HANDBOOK_PARTS.flatMap((part) => [part.summary, ...part.paragraphs, ...(part.rules ?? []).map((r) => r.rule)]).join(' ')
    expect(text).toMatch(/annual fee/i)
    expect(text).toMatch(/instalments/i)
    expect(text).toMatch(/never edited/i)
    expect(text).toMatch(/deactivate/i)
    expect(text).toMatch(/whole number of paisa/i)
    expect(text).toMatch(/no student submissions/i)
    expect(text).toMatch(/no student timetable/i)
  })

  it('never promises something the college was told it does not have', () => {
    const text = JSON.stringify(HANDBOOK_PARTS).toLowerCase()
    // Push notifications to a closed phone, and student fee payment online,
    // were both explicitly not built.
    expect(text).not.toMatch(/pay online/)
    expect(text).not.toMatch(/sms/)
  })
})

describe('finding it', () => {
  it('sits under System in the office menu, and nowhere else', () => {
    const system = NAVIGATION.ADMIN.find((g) => g.title === 'System')
    expect(system?.items.some((i) => i.href === '/admin/handbook')).toBe(true)
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(NAVIGATION[role].some((g) => g.items.some((i) => i.href.includes('handbook')))).toBe(false)
    }
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 26 screens: the finance page and its hand-drawn graph, and the card
 * that erases a record only when the server says nothing refers to it.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }), usePathname: () => '/admin/finance' }))
const post = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: del } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { FinanceScreen } = await import('@/features/finance/finance-screen')
const { MoneyChart } = await import('@/features/finance/money-chart')
const { DangerZone } = await import('@/features/admin/danger-zone')
const { FinanceTiles } = await import('@/features/dashboard/finance-tiles')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const history = [
  { month: '2026-08-01', label: 'Aug 26', collectedPaisa: 800_000, spentPaisa: 500_000 },
  { month: '2026-09-01', label: 'Sep 26', collectedPaisa: 1_000_000, spentPaisa: 400_000 },
]

const summary = {
  month: '2026-09-01',
  monthLabel: 'September 2026',
  collectedPaisa: 1_000_000,
  spentPaisa: 400_000,
  netPaisa: 600_000,
  billedPaisa: 2_250_000,
  outstandingPaisa: 1_250_000,
  overdueVouchers: 2,
  byCategory: [{ category: 'SALARIES' as const, label: 'Salaries', amountPaisa: 400_000 }],
  history,
}

const expense = {
  id: '88888888-8888-4888-8888-888888888801',
  category: 'UTILITIES' as const,
  categoryLabel: 'Utilities',
  title: 'September electricity',
  amountPaisa: 400_000,
  spentOn: '2026-09-05',
  method: 'CASH' as const,
  reference: null as string | null,
  remarks: null as string | null,
  recordedBy: 'Office',
  voidedAt: null as string | null,
  voidReason: null as string | null,
  createdAt: '2026-09-05T05:00:00.000Z',
}

const expenses = { items: [expense], page: 1, pageSize: 20, total: 1, totalPages: 1 }

describe('the finance page', () => {
  it('puts the month’s money side by side', () => {
    render(<FinanceScreen summary={summary} expenses={expenses} today="2026-09-09" canManage />)
    // The summary says it and the chart's legend says it again.
    expect(screen.getAllByText(/Collected/).length).toBeGreaterThan(0)
    expect(screen.getByText('Left over')).toBeTruthy()
    expect(screen.getAllByText('Rs 4,000').length).toBeGreaterThan(0)
    expect(screen.getByText(/2 vouchers overdue/)).toBeTruthy()
  })

  it('records an expense in rupees, dated no later than today', async () => {
    post.mockResolvedValue(expense)
    const user = userEvent.setup()
    render(<FinanceScreen summary={summary} expenses={expenses} today="2026-09-09" canManage />)

    await user.click(screen.getByRole('button', { name: /Record an expense/ }))
    await user.type(screen.getByLabelText(/^Title/), 'September water bill')
    await user.type(screen.getByLabelText(/Amount/), '3,500')
    expect((screen.getByLabelText(/Paid on/) as HTMLInputElement).max).toBe('2026-09-09')
    await user.click(screen.getByRole('button', { name: 'Record expense' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe('/api/v1/finance/expenses')
    expect(post.mock.calls[0]![1]).toMatchObject({ category: 'SALARIES', title: 'September water bill', amountPaisa: '3,500', spentOn: '2026-09-09' })
  })

  it('voids an expense only with a reason', async () => {
    post.mockResolvedValue(expense)
    const user = userEvent.setup()
    render(<FinanceScreen summary={summary} expenses={expenses} today="2026-09-09" canManage />)

    await user.click(screen.getByRole('button', { name: /Void/ }))
    expect(screen.getByRole('button', { name: 'Void expense' }).hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByLabelText(/Reason/), 'Entered twice')
    await user.click(screen.getByRole('button', { name: 'Void expense' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/finance/expenses/${expense.id}/void`, { reason: 'Entered twice' }))
  })

  it('shows a voided expense struck through, and offers no second void', () => {
    render(
      <FinanceScreen
        summary={summary}
        expenses={{ ...expenses, items: [{ ...expense, voidedAt: '2026-09-06T05:00:00.000Z', voidReason: 'Entered twice' }] }}
        today="2026-09-09"
        canManage
      />,
    )
    expect(screen.getByText('Voided')).toBeTruthy()
    expect(screen.getByText(/Entered twice/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Void$/ })).toBeNull()
  })

  it('offers nothing to change to a reader who may only look', () => {
    render(<FinanceScreen summary={summary} expenses={expenses} today="2026-09-09" canManage={false} />)
    expect(screen.queryByRole('button', { name: /Record an expense/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Void/ })).toBeNull()
  })
})

describe('the graph', () => {
  it('draws a bar per month and names the figures for a reader who cannot see it', () => {
    render(<MoneyChart history={history} />)
    const svg = screen.getByRole('img')
    expect(svg.getAttribute('aria-label')).toMatch(/last 2 months/)
    // Two bars a month, each carrying its own figure.
    expect(svg.querySelectorAll('rect').length).toBe(4)
    expect(svg.querySelector('title')?.textContent).toMatch(/Aug 26: Rs 8,000 collected/)
  })

  it('offers the same figures as a table', () => {
    render(<MoneyChart history={history} />)
    expect(screen.getByText('Show these figures as a table')).toBeTruthy()
    expect(screen.getAllByText('Rs 10,000').length).toBeGreaterThan(0)
  })

  it('says so when there is nothing to draw', () => {
    render(<MoneyChart history={[{ month: '2026-09-01', label: 'Sep 26', collectedPaisa: 0, spentPaisa: 0 }]} />)
    expect(screen.getByText(/Nothing has been collected or spent/)).toBeTruthy()
  })
})

describe('the money on the dashboard', () => {
  it('leads with what came in and what is still owed', () => {
    render(<FinanceTiles finance={summary} />)
    // The tile says it and the chart's legend says it again.
    expect(screen.getAllByText('Fees collected').length).toBe(2)
    expect(screen.getByText('Still owed')).toBeTruthy()
    expect(screen.getByText('Rs 12,500')).toBeTruthy()
    expect(screen.getByText(/2 vouchers overdue/)).toBeTruthy()
  })

  it('shows the spending, what is left over, and the year as a graph', () => {
    render(<FinanceTiles finance={summary} />)
    expect(screen.getAllByText('Spent').length).toBeGreaterThan(0)
    expect(screen.getByText('Left over')).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/months/)
    expect(screen.getByText('Where September 2026 went')).toBeTruthy()
  })

  it('links to the two pages the figures come from', () => {
    render(<FinanceTiles finance={summary} />)
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/admin/fees')
    expect(links).toContain('/admin/finance')
  })

  it('marks a month that cost more than it took', () => {
    render(<FinanceTiles finance={{ ...summary, collectedPaisa: 100_000, netPaisa: -300_000 }} />)
    expect(screen.getByText('−Rs 3,000')).toBeTruthy()
  })

  it('shows nothing at all to an administrator who may not see the money', () => {
    const { container } = render(<FinanceTiles finance={null} />)
    expect(container.textContent).toBe('')
  })
})

describe('erasing a record', () => {
  const canDelete = {
    noun: 'student',
    label: 'Ali Raza (STU-0001)',
    confirmWith: 'STU-0001',
    canDelete: true,
    reason: null as string | null,
    blockers: [] as { what: string; count: number }[],
    alsoRemoved: ['their enrolment placement'],
  }

  it('offers the button only when nothing refers to the record', () => {
    render(<DangerZone report={canDelete} endpoint="/api/v1/students/x/deletion" afterDelete="/admin/students" />)
    expect(screen.getByRole('button', { name: /Erase this student/ })).toBeTruthy()
    expect(screen.getByText(/their enrolment placement will go with it/i)).toBeTruthy()
  })

  it('explains what stands in the way instead, and offers no button', () => {
    render(
      <DangerZone
        report={{
          ...canDelete,
          canDelete: false,
          reason: 'This student cannot be erased: the school’s records still refer to them — 42 attendance marks and 2 results.',
          blockers: [
            { what: 'attendance marks', count: 42 },
            { what: 'results', count: 2 },
          ],
        }}
        endpoint="/api/v1/students/x/deletion"
        afterDelete="/admin/students"
      />,
    )
    expect(screen.queryByRole('button', { name: /Erase this student/ })).toBeNull()
    // Once in the sentence, once in the list beneath it.
    expect(screen.getAllByText(/42 attendance marks/).length).toBe(2)
    expect(screen.getAllByText(/2 results/).length).toBeGreaterThan(0)
  })

  it('will not erase until the record’s own code is typed', async () => {
    del.mockResolvedValue({ deleted: true })
    const user = userEvent.setup()
    render(<DangerZone report={canDelete} endpoint="/api/v1/students/x/deletion" afterDelete="/admin/students" />)

    await user.click(screen.getByRole('button', { name: /Erase this student/ }))
    expect(screen.getByRole('button', { name: /Erase for good/ }).hasAttribute('disabled')).toBe(true)

    await user.type(screen.getByLabelText(/Type STU-0001 to confirm/), 'STU-0002')
    expect(screen.getByRole('button', { name: /Erase for good/ }).hasAttribute('disabled')).toBe(true)

    await user.clear(screen.getByLabelText(/Type STU-0001 to confirm/))
    await user.type(screen.getByLabelText(/Type STU-0001 to confirm/), 'STU-0001')
    await user.click(screen.getByRole('button', { name: /Erase for good/ }))

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(del.mock.calls[0]![0]).toBe('/api/v1/students/x/deletion?confirm=STU-0001')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/students'))
  })
})

describe('finding it', () => {
  it('sits beside the fees, and nowhere in the other portals', () => {
    const group = NAVIGATION.ADMIN.find((g) => g.title === 'Fees & Finance')
    expect(group?.items.some((i) => i.href === '/admin/finance')).toBe(true)
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(NAVIGATION[role].some((g) => g.items.some((i) => i.href.includes('finance')))).toBe(false)
    }
  })
})

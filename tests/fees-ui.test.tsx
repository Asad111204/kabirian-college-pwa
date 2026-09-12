// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The fee screens (Phase 25, reworked in Phase 28): rupees typed in, paisa
 * sent, an annual fee made of optional heads, and nothing offered that the
 * server would refuse. The family's view of a voucher carries no buttons.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }), usePathname: () => '/admin/fees' }))
const post = vi.fn()
const put = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, put, patch: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { FeeRulesScreen } = await import('@/features/fees/fee-rules')
const { VoucherListScreen } = await import('@/features/fees/voucher-list')
const { VoucherDetailScreen } = await import('@/features/fees/voucher-detail')
const { StudentFeePlanCard } = await import('@/features/fees/student-fee-plan-card')
const { MyFeesScreen } = await import('@/features/fees/my-fees')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const VOUCHER = '77777777-7777-4777-8777-777777777772'
const STUDENT = '66666666-6666-4666-8666-666666666661'
const SESSION = '11111111-1111-4111-8111-111111111111'

const rules = { lateFinePaisa: 50_000 }

const voucherRow = {
  id: VOUCHER,
  voucherNumber: 'FV-000001',
  studentId: STUDENT,
  studentName: 'Ali Raza',
  studentCode: 'STU-0001',
  sectionLabel: '1st Year · Boys · Pre-Medical · A',
  academicSessionId: SESSION,
  academicSessionName: '2026-27',
  dueDate: null as string | null,
  grossPaisa: 3_500_000,
  discountPaisa: 500_000,
  lateFinePaisa: 0,
  paidPaisa: 1_000_000,
  netPayablePaisa: 3_000_000,
  outstandingPaisa: 2_000_000,
  paidPercent: 33,
  status: 'PARTIALLY_PAID' as const,
  overdue: false,
  createdAt: '2026-09-01T05:00:00.000Z',
}

const detail = {
  ...voucherRow,
  lines: [
    { id: 'l1', head: 'TUITION' as const, label: null, name: 'School tuition fee', amountPaisa: 3_000_000 },
    { id: 'l2', head: 'TOUR' as const, label: null, name: 'Tour fee', amountPaisa: 500_000 },
  ],
  payments: [],
  cancelReason: null as string | null,
  canRecordPayment: true,
  canCancel: true,
  blockedReason: null as string | null,
}

const page = { items: [voucherRow], page: 1, pageSize: 20, total: 1, totalPages: 1 }
const summary = {
  academicSessionId: SESSION,
  academicSessionName: '2026-27',
  vouchers: 1,
  billedPaisa: 3_000_000,
  collectedPaisa: 1_000_000,
  outstandingPaisa: 2_000_000,
  overdueVouchers: 0,
}
const sessions = [{ id: SESSION, name: '2026-27' }]

describe('the fee rules', () => {
  it('shows the late fine in rupees and saves it', async () => {
    put.mockResolvedValue(rules)
    const user = userEvent.setup()
    render(<FeeRulesScreen rules={rules} canManage />)

    expect((screen.getByLabelText(/Late fine/) as HTMLInputElement).value).toBe('500')
    await user.click(screen.getByRole('button', { name: /Save rules/ }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/fees/rules', { lateFinePaisa: '500' }))
  })

  it('says the fine only applies where the office set a due date', () => {
    render(<FeeRulesScreen rules={rules} canManage />)
    expect(screen.getByText(/pays it in instalments whenever they can/)).toBeTruthy()
  })

  it('offers nothing to change to a reader who may only look', () => {
    render(<FeeRulesScreen rules={rules} canManage={false} />)
    expect(screen.queryByRole('button', { name: /Save rules/ })).toBeNull()
    expect((screen.getByLabelText(/Late fine/) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('the year’s vouchers', () => {
  it('adds the year up above the list', () => {
    render(<VoucherListScreen page={page} summary={summary} sessions={sessions} canManage />)
    expect(screen.getAllByText('2026-27').length).toBeGreaterThan(0)
    // The summary says it and the row says it again.
    expect(screen.getAllByText('Rs 20,000').length).toBe(2)
    expect(screen.getByText('FV-000001')).toBeTruthy()
  })

  it('leads with collected and remaining, not the year’s total', () => {
    render(<VoucherListScreen page={page} summary={summary} sessions={sessions} canManage />)
    expect(screen.getAllByText('Collected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Remaining').length).toBeGreaterThan(0)
  })

  it('checks before it issues, and says what it would do', async () => {
    post.mockResolvedValue({
      academicSessionId: SESSION,
      academicSessionName: '2026-27',
      dueDate: null,
      dryRun: true,
      issued: 4,
      skippedExisting: 1,
      skippedNoFee: 2,
      totalBilledPaisa: 12_000_000,
      sample: [],
    })
    const user = userEvent.setup()
    render(<VoucherListScreen page={page} summary={summary} sessions={sessions} canManage />)

    await user.click(screen.getByRole('button', { name: /Issue vouchers/ }))
    await user.click(screen.getByRole('button', { name: /Check first/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/fees/run', { academicSessionId: SESSION, dueDate: undefined, dryRun: true }))
    expect(screen.getByText(/4 vouchers would be issued/)).toBeTruthy()
    expect(screen.getByText(/2 have no fee set for this year/)).toBeTruthy()
  })

  it('offers no issuing to somebody who may only look', () => {
    render(<VoucherListScreen page={page} summary={summary} sessions={sessions} canManage={false} />)
    expect(screen.queryByRole('button', { name: /Issue vouchers/ })).toBeNull()
  })
})

describe('one voucher', () => {
  it('shows the year, what has come in, and what is left', () => {
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" printBase="/admin/fees" />)
    expect(screen.getByText('Collected')).toBeTruthy()
    expect(screen.getByText('Remaining')).toBeTruthy()
    expect(screen.getByText('Rs 10,000')).toBeTruthy()
    expect(screen.getByText('Rs 20,000')).toBeTruthy()
    expect(screen.getByText('33% collected')).toBeTruthy()
  })

  it('itemises what the year was charged for', () => {
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" printBase="/admin/fees" />)
    expect(screen.getByText('School tuition fee')).toBeTruthy()
    expect(screen.getByText('Tour fee')).toBeTruthy()
  })

  it('says a voucher with no due date is payable in instalments', () => {
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" printBase="/admin/fees" />)
    expect(screen.getByText(/payable in instalments/)).toBeTruthy()
  })

  it('sends an instalment in rupees, dated no later than today', async () => {
    post.mockResolvedValue({ ...detail, paidPaisa: 3_000_000, status: 'PAID' })
    const user = userEvent.setup()
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" printBase="/admin/fees" />)

    await user.click(screen.getByRole('button', { name: /Record payment/ }))
    expect((screen.getByLabelText(/Received on/) as HTMLInputElement).max).toBe('2026-09-09')

    const buttons = screen.getAllByRole('button', { name: 'Record payment' })
    await user.click(buttons[buttons.length - 1]!)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe(`/api/v1/fees/vouchers/${VOUCHER}/payments`)
    expect(post.mock.calls[0]![1]).toMatchObject({ paidOn: '2026-09-09', method: 'CASH' })
  })

  it('gives a family their own bill and none of the office’s buttons', () => {
    render(<VoucherDetailScreen voucher={{ ...detail, canRecordPayment: false, canCancel: false }} today="2026-09-09" printBase="/student/fees" />)
    expect(screen.getByText('FV-000001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Record payment/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel this voucher/ })).toBeNull()
  })
})

describe('the fee on a student’s record', () => {
  const plan = {
    studentId: STUDENT,
    studentName: 'Ali Raza',
    studentCode: 'STU-0001',
    academicSessionId: SESSION,
    academicSessionName: '2026-27',
    lines: [
      { id: 'l1', head: 'TUITION' as const, label: null, name: 'School tuition fee', amountPaisa: 3_000_000 },
      { id: 'l2', head: 'OTHER' as const, label: 'Hostel', name: 'Hostel', amountPaisa: 500_000 },
    ],
    totalPaisa: 3_500_000,
    feeDiscountPaisa: 500_000,
    payablePaisa: 3_000_000,
    billed: false,
  }

  it('offers every head the college charges, all optional', () => {
    render(<StudentFeePlanCard plan={plan} canManage />)
    expect(screen.getByLabelText('School tuition fee')).toBeTruthy()
    expect(screen.getByLabelText('Annual funds')).toBeTruthy()
    expect(screen.getByLabelText('Events funds')).toBeTruthy()
    expect(screen.getByLabelText('Board registration fee')).toBeTruthy()
    expect(screen.getByLabelText('Board admission fee')).toBeTruthy()
    expect(screen.getByLabelText('Tour fee')).toBeTruthy()
    expect(screen.getByLabelText('Others')).toBeTruthy()
    expect(screen.getByText(/Leave a box empty if it does not apply/)).toBeTruthy()
  })

  it('fills in what the student is already charged, and works out the year', () => {
    render(<StudentFeePlanCard plan={plan} canManage />)
    expect((screen.getByLabelText('School tuition fee') as HTMLInputElement).value).toBe('30000')
    expect((screen.getByLabelText('Others') as HTMLInputElement).value).toBe('5000')
    expect((screen.getByLabelText(/What is it for/) as HTMLInputElement).value).toBe('Hostel')
    expect(screen.getByText('Rs 35,000')).toBeTruthy()
    expect(screen.getByText('Rs 30,000')).toBeTruthy()
  })

  it('sends only the heads that were filled in', async () => {
    put.mockResolvedValue(plan)
    const user = userEvent.setup()
    render(<StudentFeePlanCard plan={plan} canManage />)

    await user.click(screen.getByRole('button', { name: /Save fee/ }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0]).toBe(`/api/v1/students/${STUDENT}/fee-plan`)
    const body = put.mock.calls[0]![1] as { lines: { head: string }[]; academicSessionId: string }
    expect(body.academicSessionId).toBe(SESSION)
    expect(body.lines.map((line) => line.head)).toEqual(['TUITION', 'OTHER'])
  })

  it('says that saving updates the voucher already issued, and keeps the payments', () => {
    render(<StudentFeePlanCard plan={{ ...plan, billed: true }} canManage />)
    expect(screen.getByText(/Saving here updates it/)).toBeTruthy()
    expect(screen.getByText(/keeps its number and every payment already recorded/)).toBeTruthy()
  })

  it('says nothing about a voucher when none has been issued yet', () => {
    render(<StudentFeePlanCard plan={{ ...plan, billed: false }} canManage />)
    expect(screen.queryByText(/Saving here updates it/)).toBeNull()
  })

  it('offers nothing to change to a reader who may only look', () => {
    render(<StudentFeePlanCard plan={plan} canManage={false} />)
    expect(screen.queryByRole('button', { name: /Save fee/ })).toBeNull()
    expect((screen.getByLabelText('School tuition fee') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('a student’s own fees', () => {
  it('leads with what is still to pay', () => {
    render(<MyFeesScreen page={{ ...page, totalOutstandingPaisa: 2_000_000 }} />)
    expect(screen.getByText('Still to pay')).toBeTruthy()
    expect(screen.getAllByText('Rs 20,000').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-27')).toBeTruthy()
  })

  it('says how much has been paid so far', () => {
    render(<MyFeesScreen page={{ ...page, totalOutstandingPaisa: 2_000_000 }} />)
    expect(screen.getByText(/Rs 10,000 paid/)).toBeTruthy()
  })

  it('says where fees are actually paid', () => {
    render(<MyFeesScreen page={{ ...page, totalOutstandingPaisa: 0 }} />)
    expect(screen.getByText(/paid at the school office/)).toBeTruthy()
  })

  it('says something useful when nothing has been issued', () => {
    render(<MyFeesScreen page={{ items: [], page: 1, pageSize: 24, total: 0, totalPages: 1, totalOutstandingPaisa: 0 }} />)
    expect(screen.getByText('No fee vouchers yet')).toBeTruthy()
  })
})

describe('finding it', () => {
  it('is in the office menu and the student menu, and not in a teacher’s', () => {
    const fees = NAVIGATION.ADMIN.find((g) => g.title === 'Fees & Finance')
    expect(fees?.items.map((i) => i.href)).toContain('/admin/fees')
    expect(fees?.items.map((i) => i.href)).toContain('/admin/fees/rules')
    expect(NAVIGATION.STUDENT.some((g) => g.items.some((i) => i.href === '/student/fees'))).toBe(true)
    expect(NAVIGATION.STAFF.some((g) => g.items.some((i) => i.href.includes('fees')))).toBe(false)
  })
})

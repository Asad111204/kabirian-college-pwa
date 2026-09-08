// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 25 screens: rupees typed in, paisa sent, and nothing offered that the
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

const { FeePackagesScreen } = await import('@/features/fees/fee-packages')
const { VoucherListScreen } = await import('@/features/fees/voucher-list')
const { VoucherDetailScreen } = await import('@/features/fees/voucher-detail')
const { StudentFeePlanCard } = await import('@/features/fees/student-fee-plan-card')
const { MyFeesScreen } = await import('@/features/fees/my-fees')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PACKAGE = '77777777-7777-4777-8777-777777777771'
const VOUCHER = '77777777-7777-4777-8777-777777777772'
const STUDENT = '66666666-6666-4666-8666-666666666661'

const pkg = { id: PACKAGE, name: 'Pre-Medical — Regular', description: null, monthlyAmountPaisa: 1_250_000, isActive: true, studentCount: 3 }
const rules = { dueDayOfMonth: 10, lateFinePaisa: 50_000 }

const voucherRow = {
  id: VOUCHER,
  voucherNumber: 'FV-000001',
  studentId: STUDENT,
  studentName: 'Ali Raza',
  studentCode: 'STU-0001',
  sectionLabel: '1st Year · Boys · Pre-Medical · A',
  month: '2026-09-01',
  monthLabel: 'September 2026',
  dueDate: '2026-09-10',
  packageName: 'Pre-Medical — Regular',
  grossPaisa: 1_250_000,
  discountPaisa: 250_000,
  lateFinePaisa: 0,
  paidPaisa: 0,
  netPayablePaisa: 1_000_000,
  outstandingPaisa: 1_000_000,
  status: 'UNPAID' as const,
  overdue: false,
  createdAt: '2026-09-01T05:00:00.000Z',
}

const detail = {
  ...voucherRow,
  payments: [],
  cancelReason: null as string | null,
  canRecordPayment: true,
  canCancel: true,
  blockedReason: null as string | null,
}

const page = { items: [voucherRow], page: 1, pageSize: 20, total: 1, totalPages: 1 }
const summary = { month: '2026-09-01', monthLabel: 'September 2026', vouchers: 1, billedPaisa: 1_000_000, collectedPaisa: 0, outstandingPaisa: 1_000_000, overdueVouchers: 0 }

describe('packages and rules', () => {
  it('shows each package in rupees, with how many are on it', () => {
    render(<FeePackagesScreen packages={[pkg]} rules={rules} canManage />)
    expect(screen.getByText('Pre-Medical — Regular')).toBeTruthy()
    expect(screen.getByText('Rs 12,500')).toBeTruthy()
    // The column heading says it too, so both are expected.
    expect(screen.getAllByText('In use').length).toBe(2)
  })

  it('sends a new package as paisa, whatever was typed', async () => {
    post.mockResolvedValue(pkg)
    const user = userEvent.setup()
    render(<FeePackagesScreen packages={[pkg]} rules={rules} canManage />)

    await user.click(screen.getByRole('button', { name: /New package/ }))
    await user.type(screen.getByLabelText(/^Name/), 'Scholarship 50%')
    await user.type(screen.getByLabelText(/Amount per month/), '6,250.50')
    await user.click(screen.getByRole('button', { name: 'Add package' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe('/api/v1/fees/packages')
    expect(post.mock.calls[0]![1]).toMatchObject({ name: 'Scholarship 50%', monthlyAmountPaisa: '6,250.50' })
  })

  it('shows the rules in rupees and saves them', async () => {
    put.mockResolvedValue(rules)
    const user = userEvent.setup()
    render(<FeePackagesScreen packages={[pkg]} rules={rules} canManage />)

    expect((screen.getByLabelText(/Late fine/) as HTMLInputElement).value).toBe('500')
    await user.click(screen.getByRole('button', { name: /Save rules/ }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/fees/rules', { dueDayOfMonth: 10, lateFinePaisa: '500' }))
  })

  it('offers nothing to change to a reader who may only look', () => {
    render(<FeePackagesScreen packages={[pkg]} rules={rules} canManage={false} />)
    expect(screen.queryByRole('button', { name: /New package/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Save rules/ })).toBeNull()
    expect((screen.getByLabelText(/Late fine/) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('the month’s vouchers', () => {
  it('adds up the month above the list', () => {
    render(<VoucherListScreen page={page} summary={summary} month="2026-09-01" canManage />)
    expect(screen.getByText('September 2026')).toBeTruthy()
    expect(screen.getAllByText('Rs 10,000').length).toBeGreaterThan(0)
    expect(screen.getByText('FV-000001')).toBeTruthy()
  })

  it('checks before it issues, and says what it would do', async () => {
    post.mockResolvedValue({
      month: '2026-09-01',
      monthLabel: 'September 2026',
      dueDate: '2026-09-10',
      dryRun: true,
      issued: 4,
      skippedExisting: 1,
      skippedNoPackage: 2,
      skippedNotYetAdmitted: 0,
      totalBilledPaisa: 4_000_000,
      sample: [],
    })
    const user = userEvent.setup()
    render(<VoucherListScreen page={page} summary={summary} month="2026-09-01" canManage />)

    await user.click(screen.getByRole('button', { name: /Issue vouchers/ }))
    await user.click(screen.getByRole('button', { name: /Check first/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/fees/run', { month: '2026-09-01', dryRun: true }))
    expect(screen.getByText(/4 vouchers would be issued/)).toBeTruthy()
    expect(screen.getByText(/2 are not on a fee package/)).toBeTruthy()
  })

  it('offers no issuing to somebody who may only look', () => {
    render(<VoucherListScreen page={page} summary={summary} month="2026-09-01" canManage={false} />)
    expect(screen.queryByRole('button', { name: /Issue vouchers/ })).toBeNull()
  })
})

describe('one voucher', () => {
  it('shows the sum in full: fee, concession, fine, payable, outstanding', () => {
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" />)
    expect(screen.getByText('Rs 12,500')).toBeTruthy()
    expect(screen.getByText('− Rs 2,500')).toBeTruthy()
    expect(screen.getAllByText('Rs 10,000').length).toBe(2)
  })

  it('sends a payment in rupees, dated no later than today', async () => {
    post.mockResolvedValue({ ...detail, paidPaisa: 1_000_000, status: 'PAID' })
    const user = userEvent.setup()
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" />)

    await user.click(screen.getByRole('button', { name: /Record payment/ }))
    const amount = screen.getByLabelText(/Amount/) as HTMLInputElement
    expect(amount.value).toBe('10000')
    expect((screen.getByLabelText(/Received on/) as HTMLInputElement).max).toBe('2026-09-09')

    // The card's button opened the dialog; the dialog's own is the last one.
    const buttons = screen.getAllByRole('button', { name: 'Record payment' })
    await user.click(buttons[buttons.length - 1]!)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe(`/api/v1/fees/vouchers/${VOUCHER}/payments`)
    expect(post.mock.calls[0]![1]).toMatchObject({ amountPaisa: '10000', paidOn: '2026-09-09', method: 'CASH' })
  })

  it('will not cancel without a reason', async () => {
    const user = userEvent.setup()
    render(<VoucherDetailScreen voucher={detail} today="2026-09-09" />)

    await user.click(screen.getByRole('button', { name: /Cancel this voucher/ }))
    expect(screen.getByRole('button', { name: 'Cancel voucher' }).hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByLabelText(/Reason/), 'Issued twice by mistake')
    expect(screen.getByRole('button', { name: 'Cancel voucher' }).hasAttribute('disabled')).toBe(false)
  })

  it('gives a family their own bill and none of the office’s buttons', () => {
    render(<VoucherDetailScreen voucher={{ ...detail, canRecordPayment: false, canCancel: false }} today="2026-09-09" />)
    expect(screen.getByText('FV-000001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Record payment/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel this voucher/ })).toBeNull()
  })

  it('says why nothing more can be recorded on a settled voucher', () => {
    render(
      <VoucherDetailScreen
        voucher={{ ...detail, status: 'PAID', paidPaisa: 1_000_000, outstandingPaisa: 0, canRecordPayment: false, blockedReason: 'This voucher is already settled in full.' }}
        today="2026-09-09"
      />,
    )
    expect(screen.getByText(/already settled in full/)).toBeTruthy()
  })
})

describe('the plan on a student’s record', () => {
  const plan = {
    studentId: STUDENT,
    studentName: 'Ali Raza',
    studentCode: 'STU-0001',
    feePackageId: PACKAGE,
    packageName: 'Pre-Medical — Regular',
    packageMonthlyPaisa: 1_250_000,
    feeDiscountPaisa: 250_000,
    monthlyPayablePaisa: 1_000_000,
  }

  it('works out the month before anything is saved', () => {
    render(<StudentFeePlanCard plan={plan} packages={[pkg]} canManage />)
    expect(screen.getByText(/A month comes to/)).toBeTruthy()
    expect(screen.getByText('Rs 10,000')).toBeTruthy()
  })

  it('sends the package and the concession', async () => {
    put.mockResolvedValue(plan)
    const user = userEvent.setup()
    render(<StudentFeePlanCard plan={plan} packages={[pkg]} canManage />)

    await user.click(screen.getByRole('button', { name: /Save plan/ }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/api/v1/students/${STUDENT}/fee-plan`, { feePackageId: PACKAGE, feeDiscountPaisa: '2500' }))
  })

  it('says plainly when the college has no packages yet', () => {
    render(<StudentFeePlanCard plan={{ ...plan, feePackageId: null, packageName: null, packageMonthlyPaisa: null, monthlyPayablePaisa: null }} packages={[]} canManage />)
    expect(screen.getByText(/no fee packages yet/)).toBeTruthy()
  })
})

describe('a student’s own fees', () => {
  it('leads with what is still to pay', () => {
    render(<MyFeesScreen page={{ ...page, totalOutstandingPaisa: 1_000_000 }} />)
    expect(screen.getByText('Still to pay')).toBeTruthy()
    expect(screen.getAllByText('Rs 10,000').length).toBeGreaterThan(0)
    expect(screen.getByText('September 2026')).toBeTruthy()
  })

  it('says where fees are actually paid', () => {
    render(<MyFeesScreen page={{ ...page, totalOutstandingPaisa: 0 }} />)
    expect(screen.getByText(/paid at the college office/)).toBeTruthy()
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
    expect(fees?.items.map((i) => i.href)).toContain('/admin/fees/packages')
    expect(NAVIGATION.STUDENT.some((g) => g.items.some((i) => i.href === '/student/fees'))).toBe(true)
    expect(NAVIGATION.STAFF.some((g) => g.items.some((i) => i.href.includes('fees')))).toBe(false)
  })
})

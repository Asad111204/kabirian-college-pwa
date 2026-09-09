// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 27 screens: the bell and its count, the red dots on the menu, the
 * number on the app icon, and the printable fee voucher.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => '/student',
}))
const get = vi.fn()
const post = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

const setAppBadge = vi.fn(() => Promise.resolve())
const clearAppBadge = vi.fn(() => Promise.resolve())
Object.defineProperty(navigator, 'setAppBadge', { writable: true, value: setAppBadge })
Object.defineProperty(navigator, 'clearAppBadge', { writable: true, value: clearAppBadge })

const { NotificationProvider, NotificationBell } = await import('@/components/layout/notification-bell')
const { NotificationList } = await import('@/features/notifications/notification-list')
const { AppShell } = await import('@/components/layout/app-shell')
const { VoucherPrint } = await import('@/features/fees/voucher-print')
type NotificationView = import('@/server/services/notifications.service').NotificationView

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const item = (over: Partial<NotificationView> = {}): NotificationView => ({
  id: '99999999-9999-4999-8999-999999999911',
  kind: 'HOMEWORK' as const,
  kindLabel: 'Homework',
  title: 'Biology: Exercise 3.2',
  body: 'Due 15 September 2026.',
  link: '/student/homework/abc',
  read: false,
  createdAt: '2026-09-09T05:00:00.000Z',
  ...over,
})

const summary = { total: 3, byKind: { HOMEWORK: 2, NOTICE: 1 }, latest: [item()] }
const quiet = { total: 0, byKind: {}, latest: [] }

describe('the bell', () => {
  it('shows what is unread, and says it in words for a screen reader', () => {
    post.mockResolvedValue(summary)
    render(
      <NotificationProvider initial={summary}>
        <NotificationBell />
      </NotificationProvider>,
    )
    const bell = screen.getByRole('button', { name: /Notifications: 3 unread/ })
    expect(bell.textContent).toContain('3')
  })

  it('shows no number when there is nothing unread', () => {
    post.mockResolvedValue(quiet)
    render(
      <NotificationProvider initial={quiet}>
        <NotificationBell />
      </NotificationProvider>,
    )
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('lists the newest, and marks one read when it is opened', async () => {
    post.mockResolvedValue({ ...summary, total: 2 })
    const user = userEvent.setup()
    render(
      <NotificationProvider initial={summary}>
        <NotificationBell />
      </NotificationProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Notifications: 3 unread/ }))
    expect(screen.getByText('Biology: Exercise 3.2')).toBeTruthy()

    await user.click(screen.getByRole('menuitem', { name: /Biology: Exercise 3.2/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/notifications/${item().id}/read`))
  })

  it('clears everything when asked', async () => {
    // The "I have opened this page" call must not empty the bell before the
    // click; only marking everything read does that.
    post.mockImplementation((path: string) => Promise.resolve(path.includes('read-all') ? quiet : summary))
    const user = userEvent.setup()
    render(
      <NotificationProvider initial={summary}>
        <NotificationBell />
      </NotificationProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Notifications: 3 unread/ }))
    await user.click(screen.getByRole('button', { name: /Mark all read/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/notifications/read-all', {}))
  })
})

describe('the number on the app icon', () => {
  it('is set from what is unread', async () => {
    post.mockResolvedValue(summary)
    render(
      <NotificationProvider initial={summary}>
        <span>page</span>
      </NotificationProvider>,
    )
    await waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(3))
  })

  it('is cleared when nothing is unread', async () => {
    post.mockResolvedValue(quiet)
    render(
      <NotificationProvider initial={quiet}>
        <span>page</span>
      </NotificationProvider>,
    )
    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled())
  })
})

describe('the red dots in the menu', () => {
  const user = {
    fullName: 'Ali Raza',
    username: 'ali.raza',
    role: 'STUDENT' as const,
    portals: ['STUDENT' as const],
    photoUrl: null,
  }

  it('marks the buttons the unread things belong to, and no others', () => {
    post.mockResolvedValue(summary)
    render(
      <AppShell user={user} collegeName="Kabirian College" notifications={summary}>
        <p>page</p>
      </AppShell>,
    )
    // Two homework and one notice, in the sidebar and again in the drawer's
    // markup: what matters is that the right labels carry a count.
    expect(screen.getAllByLabelText('2 unread').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('1 unread').length).toBeGreaterThan(0)
  })

  it('marks nothing when nothing is unread', () => {
    post.mockResolvedValue(quiet)
    render(
      <AppShell user={user} collegeName="Kabirian College" notifications={quiet}>
        <p>page</p>
      </AppShell>,
    )
    expect(screen.queryByLabelText(/unread/)).toBeNull()
  })

  it('tells the server which page was opened, so the dot comes off', async () => {
    post.mockResolvedValue(quiet)
    render(
      <AppShell user={user} collegeName="Kabirian College" notifications={summary}>
        <p>page</p>
      </AppShell>,
    )
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/notifications/seen', { path: '/student' }))
  })
})

describe('the list of everything', () => {
  const page = { items: [item(), item({ id: 'b', read: true, title: 'Fee voucher for September 2026', kindLabel: 'Fees' })], page: 1, pageSize: 25, total: 2, totalPages: 1 }

  it('shows what is unread differently from what is read', () => {
    render(<NotificationList page={page} />)
    expect(screen.getByText('Biology: Exercise 3.2')).toBeTruthy()
    expect(screen.getByText('Fee voucher for September 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mark all read/ })).toBeTruthy()
  })

  it('offers nothing to clear when everything is read', () => {
    render(<NotificationList page={{ ...page, items: [item({ read: true })] }} />)
    expect(screen.queryByRole('button', { name: /Mark all read/ })).toBeNull()
  })

  it('says something useful when there is nothing', () => {
    render(<NotificationList page={{ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 }} />)
    expect(screen.getByText('Nothing yet')).toBeTruthy()
  })
})

describe('the printable fee voucher', () => {
  const voucher = {
    id: '77777777-7777-4777-8777-777777777772',
    voucherNumber: 'FV-000001',
    studentId: '66666666-6666-4666-8666-666666666661',
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
    payments: [],
    cancelReason: null,
    canRecordPayment: false,
    canCancel: false,
    blockedReason: null,
  }

  it('prints three copies on one page: bank, college and student', () => {
    render(<VoucherPrint voucher={voucher} collegeName="Kabirian College" />)
    expect(screen.getByText('Bank copy')).toBeTruthy()
    expect(screen.getByText('College copy')).toBeTruthy()
    expect(screen.getByText('Student copy')).toBeTruthy()
    expect(screen.getAllByText('Kabirian College').length).toBe(3)
  })

  it('carries the figures on every copy, and the amount to pay', () => {
    render(<VoucherPrint voucher={voucher} collegeName="Kabirian College" />)
    expect(screen.getAllByText('FV-000001').length).toBe(3)
    expect(screen.getAllByText('Rs 10,000').length).toBe(3)
    expect(screen.getAllByText('− Rs 2,500').length).toBe(3)
    expect(screen.getAllByText('Payable').length).toBe(3)
  })

  it('shows a late fine only when there is one', () => {
    const { unmount } = render(<VoucherPrint voucher={voucher} collegeName="Kabirian College" />)
    expect(screen.queryByText('Late fine')).toBeNull()
    unmount()

    render(<VoucherPrint voucher={{ ...voucher, lateFinePaisa: 50_000, netPayablePaisa: 1_050_000, outstandingPaisa: 1_050_000 }} collegeName="Kabirian College" />)
    expect(screen.getAllByText('Late fine').length).toBe(3)
  })

  it('offers the print dialogue, and keeps the button off the paper', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { writable: true, value: print })
    const user = userEvent.setup()
    render(<VoucherPrint voucher={voucher} collegeName="Kabirian College" />)

    const button = screen.getByRole('button', { name: /Print or save as PDF/ })
    expect(button.closest('.print-hide')).not.toBeNull()
    await user.click(button)
    expect(print).toHaveBeenCalled()
  })
})

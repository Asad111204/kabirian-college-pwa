// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 23 screens: the student's form sends what the API accepts, the thread
 * offers only what the server said this reader may do, and the office's
 * controls appear for the office alone.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
const post = vi.fn()
const patch = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, patch, put: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { ComplaintFormDialog } = await import('@/features/complaints/complaint-form-dialog')
const { ComplaintList } = await import('@/features/complaints/complaint-list')
const { ComplaintThread } = await import('@/features/complaints/complaint-thread')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ID = '77777777-7777-4777-8777-777777777771'
const STUDENT = '66666666-6666-4666-8666-666666666661'

const base = {
  id: ID,
  subject: 'Fee voucher shows last month twice',
  category: 'FEES' as const,
  categoryLabel: 'Fees',
  status: 'SUBMITTED' as const,
  statusLabel: 'Submitted',
  statusTone: 'info' as const,
  awaiting: 'OFFICE' as const,
  waitingDays: 2,
  replyCount: 0,
  createdAt: '2026-09-06T09:00:00.000Z',
  lastActivityAt: '2026-09-06T09:00:00.000Z',
  studentId: STUDENT,
  studentName: 'Ali Raza',
  studentCode: 'STU-0001',
  sectionLabel: '1st Year · Boys · Pre-Medical · A',
}

const detail = {
  ...base,
  body: 'I paid the August voucher on the 3rd but September still shows it as due.',
  messages: [],
  canReply: true,
  canWithdraw: true,
  canChangeStatus: false,
  nextStatuses: [] as { value: 'SUBMITTED' | 'IN_REVIEW' | 'RESOLVED' | 'WITHDRAWN'; label: string }[],
  closedReason: null as string | null,
}

const page = { items: [base], page: 1, pageSize: 20, total: 1, totalPages: 1 }

describe('a student writing to the office', () => {
  it('sends the category, the subject and what happened', async () => {
    post.mockResolvedValue(detail)
    const onSent = vi.fn()
    const user = userEvent.setup()
    render(<ComplaintFormDialog open onOpenChange={vi.fn()} onSent={onSent} />)

    await user.selectOptions(screen.getByLabelText(/What is it about/), 'FEES')
    await user.type(screen.getByLabelText(/Subject/), 'Fee voucher wrong')
    await user.type(screen.getByLabelText(/What happened/), 'The August voucher is showing again in September.')
    await user.click(screen.getByRole('button', { name: /Send to the office/ }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe('/api/v1/complaints')
    expect(post.mock.calls[0]![1]).toEqual({
      category: 'FEES',
      subject: 'Fee voucher wrong',
      body: 'The August voucher is showing again in September.',
    })
    expect(onSent).toHaveBeenCalledWith(detail)
  })

  it('warns that an application cannot be edited once sent', () => {
    render(<ComplaintFormDialog open onOpenChange={vi.fn()} onSent={vi.fn()} />)
    expect(screen.getByText(/cannot be edited/)).toBeTruthy()
  })
})

describe('the list', () => {
  it('tells a student their applications are private, and offers the form', () => {
    render(<ComplaintList page={page} mine basePath="/student/complaints" />)
    expect(screen.getByText(/Only you and the office can read/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Write to the office/ })).toBeTruthy()
    expect(screen.getByText('With the office')).toBeTruthy()
  })

  it('does not name the student to the student, and does name them to the office', () => {
    const { unmount } = render(<ComplaintList page={page} mine basePath="/student/complaints" />)
    expect(screen.queryByText(/STU-0001/)).toBeNull()
    unmount()

    render(<ComplaintList page={page} mine={false} basePath="/admin/complaints" />)
    expect(screen.getByText(/Ali Raza · STU-0001/)).toBeTruthy()
    expect(screen.getByText('Waiting 2 days')).toBeTruthy()
  })

  it('gives the office its filters and the student none', () => {
    const { unmount } = render(<ComplaintList page={page} mine={false} basePath="/admin/complaints" />)
    expect(screen.getByLabelText('Filter by state')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Waiting on us/ })).toBeTruthy()
    unmount()

    render(<ComplaintList page={page} mine basePath="/student/complaints" />)
    expect(screen.queryByLabelText('Filter by state')).toBeNull()
  })

  it('says something useful when there is nothing there', () => {
    render(<ComplaintList page={{ ...page, items: [], total: 0 }} mine basePath="/student/complaints" />)
    expect(screen.getByText('You have not written to the office')).toBeTruthy()
  })
})

describe('the thread', () => {
  it('shows the application and the exchange, and who said what', () => {
    render(
      <ComplaintThread
        complaint={{
          ...detail,
          messages: [
            { id: 'm1', body: 'We have asked the accounts office.', byOffice: true, authorName: 'The school office', createdAt: '2026-09-07T09:00:00.000Z' },
            { id: 'm2', body: 'Thank you.', byOffice: false, authorName: 'Ali Raza', createdAt: '2026-09-07T10:00:00.000Z' },
          ],
        }}
      />,
    )
    expect(screen.getByText('We have asked the accounts office.')).toBeTruthy()
    expect(screen.getByText(/The school office ·/)).toBeTruthy()
    // The header names the student too, so the message's own byline is one of two.
    expect(screen.getAllByText(/Ali Raza ·/).length).toBe(2)
    expect(screen.getByText('Thank you.')).toBeTruthy()
  })

  it('sends a reply to the application it is showing', async () => {
    post.mockResolvedValue(detail)
    const user = userEvent.setup()
    render(<ComplaintThread complaint={detail} />)

    await user.type(screen.getByLabelText(/Add a message/), 'The voucher still shows it.')
    await user.click(screen.getByRole('button', { name: /Send/ }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe(`/api/v1/complaints/${ID}/replies`)
    expect(post.mock.calls[0]![1]).toEqual({ body: 'The voucher still shows it.' })
  })

  it('lets the student withdraw, and never offers the office that button', () => {
    const { unmount } = render(<ComplaintThread complaint={detail} />)
    expect(screen.getByRole('button', { name: /Withdraw this application/ })).toBeTruthy()
    unmount()

    render(<ComplaintThread complaint={{ ...detail, canWithdraw: false, canChangeStatus: true, nextStatuses: [{ value: 'RESOLVED', label: 'Resolved' }] }} />)
    expect(screen.queryByRole('button', { name: /Withdraw this application/ })).toBeNull()
  })

  it('gives the office its closing message and the states it may move to', async () => {
    patch.mockResolvedValue({ ...detail, status: 'RESOLVED' })
    const user = userEvent.setup()
    render(
      <ComplaintThread
        complaint={{
          ...detail,
          canWithdraw: false,
          canChangeStatus: true,
          nextStatuses: [
            { value: 'IN_REVIEW', label: 'Being looked at' },
            { value: 'RESOLVED', label: 'Resolved' },
          ],
        }}
      />,
    )

    await user.type(screen.getByLabelText(/Closing message/), 'Corrected on the voucher.')
    await user.click(screen.getByRole('button', { name: /Mark resolved/ }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0]![0]).toBe(`/api/v1/complaints/${ID}`)
    expect(patch.mock.calls[0]![1]).toEqual({ status: 'RESOLVED', note: 'Corrected on the voucher.' })
  })

  it('offers nothing at all on a closed application, and says why', () => {
    render(
      <ComplaintThread
        complaint={{
          ...detail,
          status: 'RESOLVED',
          statusLabel: 'Resolved',
          statusTone: 'success',
          awaiting: null,
          canReply: false,
          canWithdraw: false,
          canChangeStatus: false,
          closedReason: 'This application has been resolved, so nothing more can be added to it.',
        }}
      />,
    )
    expect(screen.getByText(/nothing more can be added/)).toBeTruthy()
    expect(screen.queryByLabelText(/Add a message/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Withdraw/ })).toBeNull()
  })
})

describe('finding it', () => {
  it('is in the office menu and in the student menu, and not in a teacher’s', () => {
    const admin = NAVIGATION.ADMIN.find((g) => g.title === 'Communication')
    expect(admin?.items.some((i) => i.href === '/admin/complaints')).toBe(true)
    expect(NAVIGATION.STUDENT.some((g) => g.items.some((i) => i.href === '/student/complaints'))).toBe(true)
    expect(NAVIGATION.STAFF.some((g) => g.items.some((i) => i.href.includes('complaints')))).toBe(false)
  })
})

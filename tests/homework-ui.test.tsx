// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The homework screens: the editor sends what the API accepts and nothing
 * else, the list shows what the server sent and offers "set homework" only
 * to those who may, and the student's feed reads what reaches them.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post, put, patch: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { HomeworkEditorDialog } = await import('@/features/homework/homework-editor-dialog')
const { HomeworkList } = await import('@/features/homework/homework-list')
const { HomeworkFeed } = await import('@/features/homework/homework-feed')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SEC = '44444444-4444-4444-8444-444444444411'
const SUB = '55555555-5555-4555-8555-555555555551'
const options = { targets: [{ sectionId: SEC, subjectId: SUB, label: '1st Year · Boys · Pre-Medical · Section A — Biology', sessionName: '2026-27' }] }
const row = {
  id: '66666666-6666-4666-8666-666666666661',
  title: 'Exercise 3.2',
  dueDate: '2026-09-15',
  due: { label: 'Due in 7 days', tone: 'neutral' as const },
  sectionId: SEC,
  sectionName: 'A',
  className: '1st Year',
  divisionName: 'Boys',
  programName: 'Pre-Medical',
  subjectId: SUB,
  subjectName: 'Biology',
  staffId: 'staff-1',
  teacherName: 'Sara Khan',
  attachmentCount: 2,
  createdAt: '2026-09-08T05:00:00.000Z',
  canManage: true,
}

describe('the editor', () => {
  it('sends the chosen section and subject, the words and the date, exactly as the API accepts', async () => {
    post.mockResolvedValue({ ...row, instructions: 'Questions 1 to 10.', attachments: [] })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<HomeworkEditorDialog open onOpenChange={() => {}} options={options} onSaved={onSaved} />)
    await user.type(screen.getByLabelText(/Title/), 'Exercise 3.2')
    await user.type(screen.getByLabelText(/Instructions/), 'Questions 1 to 10.')
    await user.type(screen.getByLabelText(/Due date/), '2026-09-15')
    await user.click(screen.getByRole('button', { name: 'Set homework' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/homework', { sectionId: SEC, subjectId: SUB, title: 'Exercise 3.2', instructions: 'Questions 1 to 10.', dueDate: '2026-09-15' }))
    expect(onSaved).toHaveBeenCalled()
  })

  it('changes only the words and the date of an existing piece', async () => {
    put.mockResolvedValue({ ...row, title: 'Exercise 3.3', instructions: '', attachments: [] })
    const user = userEvent.setup()
    render(<HomeworkEditorDialog open onOpenChange={() => {}} options={options} existing={{ ...row, instructions: '', attachments: [] }} onSaved={vi.fn()} />)
    expect(screen.queryByLabelText(/Section and subject/)).toBeNull()
    await user.clear(screen.getByLabelText(/Title/))
    await user.type(screen.getByLabelText(/Title/), 'Exercise 3.3')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/api/v1/homework/${row.id}`, { title: 'Exercise 3.3', instructions: '', dueDate: '2026-09-15' }))
  })

  it('explains itself when there is no section to set homework for', () => {
    render(<HomeworkEditorDialog open onOpenChange={() => {}} options={{ targets: [] }} onSaved={vi.fn()} />)
    expect(screen.getByText(/no active teaching assignments/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Set homework' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the list', () => {
  it('shows each piece with its section, teacher and due date, and links to it', () => {
    render(<HomeworkList items={[row]} page={1} pageSize={20} total={1} totalPages={1} filters={{ search: '', includePast: false }} options={options} basePath="/staff/homework" canCreate />)
    expect(screen.getByRole('link', { name: 'Exercise 3.2' }).getAttribute('href')).toBe(`/staff/homework/${row.id}`)
    expect(screen.getByText('1st Year · Boys · Pre-Medical · Section A')).toBeTruthy()
    expect(screen.getByText('Due in 7 days')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Set homework/ })).toBeTruthy()
  })

  it('offers no "set homework" to someone who may not, and puts filters in the URL', async () => {
    const user = userEvent.setup()
    render(<HomeworkList items={[]} page={1} pageSize={20} total={0} totalPages={0} filters={{ search: '', includePast: false }} options={{ targets: [] }} basePath="/admin/homework" canCreate={false} />)
    expect(screen.queryByRole('button', { name: /Set homework/ })).toBeNull()
    await user.click(screen.getByLabelText('Include past due dates'))
    expect(push).toHaveBeenLastCalledWith('/admin/homework?includePast=true')
  })
})

describe('the student feed', () => {
  it('lists what the server sent and asks for past homework only when told to', async () => {
    get.mockResolvedValue({ items: [{ ...row, canManage: false, due: { label: 'Was due 2 days ago', tone: 'danger' } }], total: 1, page: 1, pageSize: 20, totalPages: 1 })
    const user = userEvent.setup()
    render(<HomeworkFeed initial={{ items: [{ ...row, canManage: false }], total: 1, page: 1, pageSize: 20, totalPages: 1 }} />)
    expect(screen.getByRole('link', { name: 'Exercise 3.2' }).getAttribute('href')).toBe(`/student/homework/${row.id}`)
    expect(screen.getByText(/2 files/)).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
    await user.click(screen.getByLabelText(/due date has passed/))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/v1/homework/feed?page=1&includePast=true'))
    expect(await screen.findByText('Was due 2 days ago')).toBeTruthy()
  })

  it('is in every portal’s navigation', () => {
    for (const role of ['ADMIN', 'STAFF', 'STUDENT'] as const) {
      expect(NAVIGATION[role].flatMap((s) => s.items).some((i) => i.label === 'Homework' && !i.comingSoon)).toBe(true)
    }
  })
})

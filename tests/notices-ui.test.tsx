// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The office's notice and event screens.
 *
 * What matters beyond rendering: the editor sends exactly what the API
 * accepts, with the audience rows turned into targets and times left on the
 * college's clock; field errors from a 400 land on the right control; and
 * publishing, archiving and deleting are confirmed, separate actions that
 * never appear on the form.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post, put, patch, delete: del } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { NoticeEditorDialog } = await import('@/features/notices/notice-editor-dialog')
const { NoticeList } = await import('@/features/notices/notice-list')
const { NoticeDetail } = await import('@/features/notices/notice-detail')
const { EventEditorDialog } = await import('@/features/events/event-editor-dialog')
const { EventDetail } = await import('@/features/events/event-detail')
const { formatCollegeLocal } = await import('@/features/notices/shared')
const { NAVIGATION } = await import('@/components/layout/nav-config')
const { ApiError } = await import('@/lib/api-client')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */

const SECTION = '44444444-4444-4444-8444-444444444441'
const CLASS = '22222222-2222-4222-8222-222222222221'

const options = {
  classes: [{ id: CLASS, name: '1st Year' }],
  divisions: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Boys' }],
  programs: [{ id: '22222222-2222-4222-8222-222222222223', name: 'Pre-Medical' }],
  groups: [{ id: '33333333-3333-4333-8333-333333333331', label: '1st Year · Boys · Pre-Medical' }],
  sections: [{ id: SECTION, label: 'Section A · 1st Year · Boys · Pre-Medical' }],
  sessionName: '2026-27',
}

const notice = (over: Record<string, unknown> = {}) =>
  ({
    id: 'notice-1',
    title: 'Sports day',
    body: 'Friday.\nBe there.',
    category: 'GENERAL',
    status: 'DRAFT',
    isPinned: false,
    publishAt: '2026-09-08T03:00:00.000Z',
    publishAtLocal: '2026-09-08T08:00',
    expiresAt: null,
    expiresAtLocal: null,
    audienceSummary: 'Everyone',
    attachmentCount: 0,
    updatedAt: '2026-09-08T03:00:00.000Z',
    targets: [
      {
        id: 't1',
        audience: 'ALL',
        classId: null,
        divisionId: null,
        programId: null,
        academicGroupId: null,
        sectionId: null,
        label: 'Everyone',
      },
    ],
    attachments: [],
    createdByName: 'Admin',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

/* -------------------------------------------------------------------------- */

describe('the college clock, displayed', () => {
  it('shows the digits it was given and never shifts them', () => {
    expect(formatCollegeLocal('2026-09-08T08:00')).toBe('8 Sept 2026, 08:00')
    expect(formatCollegeLocal(null)).toBe('—')
  })
})

describe('writing a notice', () => {
  it('sends the audience rows as targets and the times as typed', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue(notice())
    const onSaved = vi.fn()
    render(<NoticeEditorDialog open onOpenChange={() => {}} options={options} onSaved={onSaved} />)

    await user.type(screen.getByLabelText(/^Title/), 'Sports day')
    await user.type(screen.getByLabelText(/^Notice/), 'Friday.')
    await user.type(screen.getByLabelText(/Show from/), '2026-09-08T08:00')

    // Second audience: a section.
    await user.click(screen.getByRole('button', { name: /Add another audience/ }))
    await user.selectOptions(screen.getByLabelText('Audience 2'), 'SECTION')
    await user.selectOptions(screen.getByLabelText(/Which a section/i), SECTION)

    await user.click(screen.getByRole('button', { name: /Save draft/ }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [path, payload] = post.mock.calls[0]!
    expect(path).toBe('/api/v1/notices')
    expect(payload).toMatchObject({
      title: 'Sports day',
      body: 'Friday.',
      category: 'GENERAL',
      isPinned: false,
      publishAt: '2026-09-08T08:00',
      expiresAt: '',
      targets: [{ audience: 'ALL' }, { audience: 'SECTION', sectionId: SECTION }],
    })
    // Nothing the API does not accept: no status, no zone, no id.
    expect(payload).not.toHaveProperty('status')
    expect(JSON.stringify(payload)).not.toMatch(/Z"|\+05:00/)
    expect(onSaved).toHaveBeenCalled()
  })

  it('puts a 400 field error on its control and keeps what was typed', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(
      new ApiError('Please check the highlighted fields.', 400, 'VALIDATION', {
        expiresAt: ['A notice cannot expire before it is published.'],
      }),
    )
    render(<NoticeEditorDialog open onOpenChange={() => {}} options={options} onSaved={vi.fn()} />)
    await user.type(screen.getByLabelText(/^Title/), 'Keep me')
    await user.type(screen.getByLabelText(/^Notice/), 'x')
    await user.click(screen.getByRole('button', { name: /Save draft/ }))

    expect(await screen.findByText(/cannot expire before/)).toBeTruthy()
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Keep me')
  })

  it('edits by PUT with the notice’s own values filled in', async () => {
    const user = userEvent.setup()
    put.mockResolvedValue(notice({ title: 'Sports day (moved)' }))
    render(
      <NoticeEditorDialog open onOpenChange={() => {}} options={options} initial={notice()} onSaved={vi.fn()} />,
    )
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Sports day')
    expect((screen.getByLabelText(/Show from/) as HTMLInputElement).value).toBe('2026-09-08T08:00')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/notices/notice-1', expect.anything()))
  })

  it('offers no status control', () => {
    render(<NoticeEditorDialog open onOpenChange={() => {}} options={options} onSaved={vi.fn()} />)
    expect(screen.queryByLabelText(/status/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('the office list', () => {
  const rows = [
    notice(),
    notice({ id: 'n2', title: 'Exam timetable', category: 'EXAM', status: 'PUBLISHED', isPinned: true, audienceSummary: 'All students' }),
  ]
  const list = (over: Record<string, unknown> = {}) => (
    <NoticeList
      notices={rows}
      page={1}
      pageSize={25}
      total={2}
      totalPages={1}
      filters={{ status: '', category: '', search: '' }}
      options={options}
      canManage
      {...over}
    />
  )

  it('shows each notice with its audience, status and category', () => {
    render(list())
    expect(screen.getByRole('link', { name: 'Sports day' }).getAttribute('href')).toBe('/admin/notices/notice-1')
    expect(screen.getAllByText('All students').length).toBeGreaterThan(0)
    // 'Published' is also a filter tab, so look inside the table.
    const table = screen.getByRole('table')
    expect(within(table).getByText('Published')).toBeTruthy()
    expect(within(table).getByText('Examination')).toBeTruthy()
    expect(screen.getByText('Pinned')).toBeTruthy()
  })

  it('filters through the URL, on the server', async () => {
    const user = userEvent.setup()
    render(list())
    await user.click(screen.getByRole('button', { name: 'Draft' }))
    expect(push).toHaveBeenCalledWith('/admin/notices?status=DRAFT')
  })

  it('offers no write button without the permission', () => {
    render(list({ canManage: false }))
    expect(screen.queryByRole('button', { name: /Write a notice/ })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('one notice', () => {
  const detail = (over: Record<string, unknown> = {}) => (
    <NoticeDetail initial={notice(over)} options={options} canManage storageReady={false} />
  )

  it('shows the body with its line breaks and who it is for', () => {
    render(detail())
    expect(screen.getByText(/Friday\./).className).toContain('whitespace-pre-wrap')
    expect(screen.getAllByText('Everyone').length).toBeGreaterThan(0)
  })

  it('publishes only after a confirmation, by PATCH', async () => {
    const user = userEvent.setup()
    patch.mockResolvedValue(notice({ status: 'PUBLISHED' }))
    render(detail())
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(patch).not.toHaveBeenCalled()
    expect(screen.getByText('Publish this notice?')).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/v1/notices/notice-1', { status: 'PUBLISHED' }))
    expect(await screen.findByText('Published')).toBeTruthy()
  })

  it('offers delete for a draft only; a published notice is archived', () => {
    render(detail({ status: 'PUBLISHED' }))
    expect(screen.queryByRole('button', { name: /Delete draft/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    expect(screen.getByText(/archived, not deleted/)).toBeTruthy()
  })

  it('deletes a draft after confirming, and goes back to the list', async () => {
    const user = userEvent.setup()
    del.mockResolvedValue({ deleted: true })
    render(detail())
    await user.click(screen.getByRole('button', { name: /Delete draft/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/v1/notices/notice-1'))
    expect(push).toHaveBeenCalledWith('/admin/notices')
  })

  it('explains why files cannot be attached when Drive is not connected', () => {
    render(detail())
    expect(screen.getByText(/connects Google Drive/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Attach/ })).toBeNull()
  })

  it('offers nothing that writes, without the permission', () => {
    render(<NoticeDetail initial={notice()} options={options} canManage={false} storageReady />)
    expect(screen.queryByRole('button', { name: /Publish|Edit|Delete|Attach/ })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('events', () => {
  const event = (over: Record<string, unknown> = {}) =>
    ({
      id: 'event-1',
      title: 'Parents’ day',
      description: null,
      startsAt: '2026-10-01T04:00:00.000Z',
      startsAtLocal: '2026-10-01T09:00',
      endsAt: null,
      endsAtLocal: null,
      location: 'Main hall',
      audience: 'ALL',
      status: 'DRAFT',
      coverDocumentId: null,
      attachmentCount: 1,
      updatedAt: '2026-09-08T03:00:00.000Z',
      attachments: [
        { id: 'pic-1', originalFileName: 'hall.jpg', mimeType: 'image/jpeg', fileSizeBytes: 1000, isImage: true, uploadedAt: '2026-09-08T03:00:00.000Z' },
      ],
      createdByName: 'Admin',
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  it('the editor sends a population audience and the clock time as typed', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue(event())
    render(<EventEditorDialog open onOpenChange={() => {}} onSaved={vi.fn()} />)
    await user.type(screen.getByLabelText(/^Title/), 'Parents’ day')
    await user.type(screen.getByLabelText(/^Starts/), '2026-10-01T09:00')
    await user.selectOptions(screen.getByLabelText(/Who it is for/), 'STUDENTS')
    await user.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![1]).toMatchObject({ title: 'Parents’ day', startsAt: '2026-10-01T09:00', audience: 'STUDENTS' })
    // No section audience is even offered.
    expect(within(screen.getByLabelText(/Who it is for/)).queryByText('A section')).toBeNull()
  })

  it('makes one of its own pictures the cover, by PUT', async () => {
    const user = userEvent.setup()
    put.mockResolvedValue(event({ coverDocumentId: 'pic-1' }))
    render(<EventDetail initial={event()} canManage storageReady />)
    await user.click(screen.getByRole('button', { name: 'Use as cover' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/events/event-1/cover', { documentId: 'pic-1' }))
    expect(await screen.findByRole('button', { name: 'Clear cover' })).toBeTruthy()
  })

  it('cancels rather than deletes a published event', () => {
    render(<EventDetail initial={event({ status: 'PUBLISHED' })} canManage storageReady />)
    expect(screen.getByRole('button', { name: 'Cancel event' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Delete draft/ })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('navigation', () => {
  it('gives the office Notices and Events, and nobody else an admin link', () => {
    const admin = NAVIGATION.ADMIN.flatMap((s) => s.items).map((i) => i.href)
    expect(admin).toContain('/admin/notices')
    expect(admin).toContain('/admin/events')
    for (const role of ['STAFF', 'STUDENT'] as const) {
      const hrefs = NAVIGATION[role].flatMap((s) => s.items).map((i) => i.href)
      expect(hrefs.some((h) => h.startsWith('/admin/'))).toBe(false)
    }
  })
})

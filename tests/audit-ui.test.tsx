// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The audit viewer.
 *
 * What matters: the filters live in the URL, the CSV link is that URL plus
 * `format=csv`, the list never contains a snapshot, and the detail dialog
 * shows the redacted change list the API returns and nothing else.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
const get = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const { AuditViewer, auditQueryString, recordHref } = await import('@/features/audit/audit-viewer')
const { NAVIGATION } = await import('@/components/layout/nav-config')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ENTRY_ID = '22222222-2222-4222-8222-222222222222'

const options = {
  modules: [
    { key: 'user', label: 'User accounts' },
    { key: 'student', label: 'Students' },
  ],
  actions: [
    { key: 'user.created', label: 'created the account', module: 'user' },
    { key: 'student.updated', label: 'updated the record for', module: 'student' },
  ],
  entityTypes: ['student', 'user'],
}

const items = [
  {
    id: ENTRY_ID,
    action: 'student.updated',
    module: 'student',
    description: 'updated the record for',
    tone: 'neutral' as const,
    entityType: 'student',
    entityId: USER_ID,
    entityLabel: 'STU-0001 Ali Raza',
    actor: { username: 'admin', name: 'Office Admin' },
    actorRole: 'ADMIN',
    ipAddress: '10.0.0.1',
    createdAt: '2026-09-08T09:00:00.000Z',
  },
]

const noFilters = { actor: '', module: '', action: '', entityType: '', dateFrom: '', dateTo: '', includeSignIns: false }

function renderViewer(filters = noFilters, rows = items) {
  return render(<AuditViewer items={rows} page={1} pageSize={25} total={rows.length} totalPages={1} filters={filters} options={options} />)
}

describe('the audit viewer', () => {
  it('lists who did what to which record, and links the record', () => {
    renderViewer()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Office Admin')).toBeTruthy()
    expect(table.getByText('updated the record for')).toBeTruthy() // the sentence, not the raw key
    expect(table.getByText('student.updated')).toBeTruthy()
    const link = table.getByRole('link', { name: 'STU-0001 Ali Raza' })
    expect(link.getAttribute('href')).toBe(`/admin/students/${USER_ID}`)
    expect(screen.getByText('1 entry, newest first.')).toBeTruthy()
  })

  it('puts the filters in the URL when applied', async () => {
    const user = userEvent.setup()
    renderViewer()
    await user.selectOptions(screen.getByLabelText('Module'), 'user')
    await user.selectOptions(screen.getByLabelText('Action'), 'user.created')
    await user.type(screen.getByLabelText('Who'), 'admin')
    await user.click(screen.getByLabelText('Include sign-ins and sign-outs'))
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(push).toHaveBeenLastCalledWith('/admin/audit?actor=admin&module=user&action=user.created&includeSignIns=true')
  })

  it('offers only the actions of the chosen module', async () => {
    const user = userEvent.setup()
    renderViewer()
    await user.selectOptions(screen.getByLabelText('Module'), 'student')
    const select = screen.getByLabelText('Action') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'student.updated'])
  })

  it('links the CSV download to the loaded query plus format=csv', () => {
    renderViewer({ ...noFilters, module: 'user', dateFrom: '2026-09-01' })
    const csv = screen.getByRole('link', { name: /Download CSV/ })
    expect(csv.getAttribute('href')).toBe('/api/v1/audit?module=user&dateFrom=2026-09-01&format=csv')
  })

  it('asks the API for one entry and shows the redacted changes', async () => {
    get.mockResolvedValue({
      ...items[0],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128',
      changes: [{ field: 'Full name', before: 'Ali', after: 'Ali Raza' }],
      facts: [],
      hasHiddenDetail: false,
    })
    const user = userEvent.setup()
    renderViewer()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/api/v1/audit/${ENTRY_ID}`))
    expect(await screen.findByText('Full name')).toBeTruthy()
    expect(screen.getByText('Ali')).toBeTruthy()
    expect(screen.getByText('Ali Raza')).toBeTruthy()
  })

  it('says when an entry recorded only internal references', async () => {
    get.mockResolvedValue({ ...items[0], userAgent: null, changes: [], facts: [], hasHiddenDetail: true })
    const user = userEvent.setup()
    renderViewer()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText(/Only internal references were recorded/)).toBeTruthy()
  })

  it('shows an empty state with advice when nothing matches', () => {
    renderViewer({ ...noFilters, module: 'user' }, [])
    expect(screen.getByText('Nothing recorded for these filters')).toBeTruthy()
    expect(screen.getByText(/widening the dates/)).toBeTruthy()
  })
})

describe('helpers', () => {
  it('builds the query only from set filters, page after the first', () => {
    expect(auditQueryString(noFilters)).toBe('')
    expect(auditQueryString({ ...noFilters, entityType: 'user' }, 3)).toBe('entityType=user&page=3')
    expect(auditQueryString(noFilters, 1)).toBe('')
  })

  it('links only record types that have a page', () => {
    expect(recordHref('user', USER_ID)).toBe(`/admin/users/${USER_ID}`)
    expect(recordHref('attendance_sheet', USER_ID)).toBeNull()
    expect(recordHref('user', null)).toBeNull()
  })

  it('is in the office navigation, no longer marked as coming soon', () => {
    const item = NAVIGATION.ADMIN.flatMap((s) => s.items).find((i) => i.href === '/admin/audit')
    expect(item).toBeTruthy()
    expect(item?.comingSoon).toBeUndefined()
  })
})

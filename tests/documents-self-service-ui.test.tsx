// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * A student or a teacher handing in one of their own papers.
 *
 * The rule the college asked for is that a document can be handed in once and
 * never changed afterwards, and that the person is told so *before* they
 * submit rather than after. These check exactly that: the warning is shown,
 * the file is not sent until it is accepted, a slot already on file offers
 * nothing at all, and no removal is offered anywhere.
 *
 * Hiding a button is a courtesy, never the control — the server refuses a
 * replace whatever the browser sends, and verify-self-documents.mjs proves it
 * through the production build.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { DocumentPanel } = await import('@/features/documents/document-panel')
import type { DocumentSlot } from '@/features/documents/document-panel'

const type = (key: string, label: string, extra: Partial<DocumentSlot['type']> = {}) => ({
  key,
  label,
  description: null,
  isRequired: false,
  isSensitive: false,
  allowedMimeTypes: ['image/png'],
  maxSizeBytes: 2_000_000,
  sortOrder: 1,
  ...extra,
})

const SLOTS: DocumentSlot[] = [
  { type: type('MATRIC', 'Matric roll slip'), document: null, canView: true, history: [] },
  {
    type: type('BFORM', 'B-Form'),
    document: {
      id: 'doc-1',
      documentTypeKey: 'BFORM',
      originalFileName: 'bform.png',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      status: 'ACTIVE',
      uploadedAt: '2026-09-01T10:00:00.000Z',
      uploadedByName: 'The office',
    },
    canView: true,
    history: [],
  },
]

const file = () => new File([new Uint8Array([1, 2, 3])], 'slip.png', { type: 'image/png' })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: SLOTS }) }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mine() {
  return render(
    <DocumentPanel
      slots={SLOTS}
      ownerEndpoint="/api/v1/students/s1/documents"
      canManage={false}
      selfService
      storageReady
    />,
  )
}

describe('handing in your own documents', () => {
  it('says up front that a document can only be handed in once', () => {
    mine()
    expect(screen.getByText('You can hand in a document once')).toBeTruthy()
    expect(screen.getByText(/contact the college office/i)).toBeTruthy()
  })

  it('offers an upload only for what the college is missing', () => {
    mine()
    const buttons = screen.getAllByRole('button', { name: /Upload/i })
    expect(buttons).toHaveLength(1)
    // The B-Form is already on file: nothing to press against it.
    expect(screen.queryByRole('button', { name: /Replace/i })).toBeNull()
  })

  it('never offers to remove anything', () => {
    mine()
    expect(screen.queryByRole('button', { name: /Remove/i })).toBeNull()
  })

  it('warns before the file is sent, and sends nothing until it is accepted', async () => {
    const user = userEvent.setup()
    const { container } = mine()

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file())

    expect(await screen.findByText('This cannot be undone')).toBeTruthy()
    expect(screen.getByText(/you cannot change it or remove it yourself/i)).toBeTruthy()
    // Nothing has been posted yet — only the checklist was ever fetched.
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0)
  })

  it('sends the file once the warning is accepted', async () => {
    const user = userEvent.setup()
    const { container } = mine()

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file())
    await screen.findByText('This cannot be undone')
    await user.click(screen.getByRole('button', { name: /Yes, submit it/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true))
    const posted = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')!
    expect(posted[0]).toBe('/api/v1/students/s1/documents')
    expect(posted[1].body.get('documentTypeKey')).toBe('MATRIC')
  })

  it('sends nothing when the warning is refused', async () => {
    const user = userEvent.setup()
    const { container } = mine()

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file())
    await screen.findByText('This cannot be undone')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByText('This cannot be undone')).toBeNull())
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0)
  })
})

describe('the office looking at the same panel', () => {
  function office() {
    return render(
      <DocumentPanel
        slots={SLOTS}
        ownerEndpoint="/api/v1/students/s1/documents"
        canManage
        storageReady
      />,
    )
  }

  it('is not shown the hand-in warning: none of it applies to them', () => {
    office()
    expect(screen.queryByText('You can hand in a document once')).toBeNull()
  })

  it('may replace and remove, and is not asked to confirm an upload', async () => {
    const user = userEvent.setup()
    const { container } = office()

    expect(screen.getByRole('button', { name: /Replace/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remove/i })).toBeTruthy()

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file())
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true))
    expect(screen.queryByText('This cannot be undone')).toBeNull()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The signed-in devices list. It is used by a person for their own devices
 * and by an administrator for somebody else's; the difference is what
 * happens when the current session is the one signed out.
 */

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}))
const del = vi.fn()
const post = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: del } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { SessionList } = await import('@/features/sessions/session-list')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CURRENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const sessions = [
  { id: CURRENT, device: 'Chrome on Windows', ipAddress: '10.0.0.1', createdAt: '2026-09-08T08:00:00Z', lastActiveAt: '2026-09-08T09:00:00Z', expiresAt: '2026-10-08T08:00:00Z', isCurrent: true },
  { id: OTHER, device: 'Safari on iPhone', ipAddress: '10.0.0.2', createdAt: '2026-09-07T08:00:00Z', lastActiveAt: '2026-09-07T09:00:00Z', expiresAt: '2026-10-07T08:00:00Z', isCurrent: false },
]

describe('the signed-in devices list', () => {
  it('shows each device and marks the current one', () => {
    render(<SessionList sessions={sessions} self canRevoke revokeBase="/api/v1/me/sessions" signOutOthersUrl="/api/v1/me/sessions/sign-out-others" />)
    expect(screen.getByText('Chrome on Windows')).toBeTruthy()
    expect(screen.getByText('Safari on iPhone')).toBeTruthy()
    expect(screen.getAllByText('This device').length).toBe(1)
    expect(screen.getByRole('button', { name: 'Sign out all other devices' })).toBeTruthy()
  })

  it('signs out one device through the URL it is given and refreshes the list', async () => {
    del.mockResolvedValue({ revoked: true, wasCurrent: false })
    const user = userEvent.setup()
    render(<SessionList sessions={sessions} self canRevoke revokeBase="/api/v1/me/sessions" />)
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[1]!)
    await waitFor(() => expect(del).toHaveBeenCalledWith(`/api/v1/me/sessions/${OTHER}`))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })

  it('sends a person to the sign-in page when they sign out the device they are using', async () => {
    del.mockResolvedValue({ revoked: true, wasCurrent: true })
    const user = userEvent.setup()
    render(<SessionList sessions={sessions} self canRevoke revokeBase="/api/v1/me/sessions" />)
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]!)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
  })

  it('signs out every other device with one request', async () => {
    post.mockResolvedValue({ revoked: 1 })
    const user = userEvent.setup()
    render(<SessionList sessions={sessions} self canRevoke revokeBase="/api/v1/me/sessions" signOutOthersUrl="/api/v1/me/sessions/sign-out-others" />)
    await user.click(screen.getByRole('button', { name: 'Sign out all other devices' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/me/sessions/sign-out-others', {}))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('offers no buttons to an administrator without users.manage, and no "sign out others" on another account', () => {
    render(<SessionList sessions={sessions} self={false} canRevoke={false} revokeBase="/api/v1/users/x/sessions" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the refusal when the API says no', async () => {
    const { ApiError } = await import('@/lib/api-client')
    del.mockRejectedValue(new ApiError('You do not have permission to do this.', 403, 'FORBIDDEN'))
    const user = userEvent.setup()
    render(<SessionList sessions={sessions} self={false} canRevoke revokeBase="/api/v1/users/x/sessions" />)
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]!)
    expect(await screen.findByText(/do not have permission/)).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Phase 24 screens: the switcher appears only for an account that holds two
 * portals, it moves the session through the API rather than by navigating,
 * and office access is offered on a staff account alone.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => '/staff',
}))
const post = vi.fn()
const patch = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, patch, put: vi.fn(), delete: vi.fn() } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The shell asks whether the app is already installed; jsdom has no
// matchMedia, and this phase is not about the install prompt.
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

const { AppShell } = await import('@/components/layout/app-shell')
const { SwitchPortalForm } = await import('@/app/switch/switch-portal-form')
const { UserActions } = await import('@/features/users/user-actions')
const { RoleBadge } = await import('@/features/users/shared')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const shellUser = (over: Partial<React.ComponentProps<typeof AppShell>['user']> = {}) => ({
  fullName: 'Sara Khan',
  username: 'sara.khan',
  role: 'STAFF' as const,
  portals: ['STAFF' as const],
  photoUrl: null,
  ...over,
})

/** Nothing unread: this file is about portals, not notifications. */
const quiet = { total: 0, byKind: {}, latest: [] }

/**
 * The shell asks the server what has been read the moment it renders. That
 * call must answer, or the provider throws and nothing renders at all; the
 * portal switch is what this file is actually about.
 */
function answerNotifications() {
  post.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/api/v1/notifications') ? quiet : { role: 'ADMIN', path: '/admin' }),
  )
}

/** The switch call, wherever it landed among the notification chatter. */
const switchCall = () => post.mock.calls.find((call) => String(call[0]).includes('switch-portal'))

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Account: Sara Khan/ }))
}

describe('the switcher in the user menu', () => {
  it('is not there for an account with one portal', async () => {
    answerNotifications()
    const user = userEvent.setup()
    render(
      <AppShell user={shellUser()} collegeName="Kabirian College" notifications={quiet}>
        <p>page</p>
      </AppShell>,
    )
    await openMenu(user)
    expect(screen.queryByRole('menuitem', { name: /Switch to/ })).toBeNull()
  })

  it('offers the other portal, and never the one they are in', async () => {
    answerNotifications()
    const user = userEvent.setup()
    render(
      <AppShell user={shellUser({ portals: ['STAFF', 'ADMIN'] })} collegeName="Kabirian College" notifications={quiet}>
        <p>page</p>
      </AppShell>,
    )
    await openMenu(user)
    expect(screen.getByRole('menuitem', { name: /Switch to the office portal/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Switch to the staff portal/ })).toBeNull()
  })

  it('moves the session through the API, then follows where the server sends them', async () => {
    answerNotifications()
    const user = userEvent.setup()
    render(
      <AppShell user={shellUser({ portals: ['STAFF', 'ADMIN'] })} collegeName="Kabirian College" notifications={quiet}>
        <p>page</p>
      </AppShell>,
    )
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Switch to the office portal/ }))

    await waitFor(() => expect(switchCall()).toBeDefined())
    expect(switchCall()![1]).toEqual({ role: 'ADMIN' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'))
  })

  it('shows the portal they are in, not the account’s own role', async () => {
    answerNotifications()
    const user = userEvent.setup()
    render(
      <AppShell user={shellUser({ role: 'ADMIN', portals: ['STAFF', 'ADMIN'] })} collegeName="Kabirian College" notifications={quiet}>
        <p>page</p>
      </AppShell>,
    )
    await openMenu(user)
    expect(screen.getAllByText('Admin Portal').length).toBeGreaterThan(0)
    expect(screen.getByRole('menuitem', { name: /Switch to the staff portal/ })).toBeTruthy()
  })
})

describe('the page you land on from a link into the other portal', () => {
  it('switches only when asked, and goes where the link was pointing', async () => {
    post.mockResolvedValue({ role: 'ADMIN', path: '/admin' })
    const user = userEvent.setup()
    render(<SwitchPortalForm to="ADMIN" next="/admin/students" stayPath="/staff" label="office" />)

    await user.click(screen.getByRole('button', { name: /Continue in the office portal/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/auth/switch-portal', { role: 'ADMIN' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/students'))
  })

  it('lets them say no, and switches nothing', async () => {
    const user = userEvent.setup()
    render(<SwitchPortalForm to="ADMIN" next="/admin/students" stayPath="/staff" label="office" />)

    await user.click(screen.getByRole('button', { name: /Stay where I am/ }))
    expect(post).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/staff')
  })
})

describe('giving a member of staff office access', () => {
  const account = {
    id: '99999999-9999-4999-8999-999999999903',
    username: 'sara.khan',
    displayName: 'Sara Khan',
    fullNameValue: 'Sara Khan',
    email: null,
    role: 'STAFF' as const,
    status: 'ACTIVE' as const,
    isLocked: false,
    isSystemOwner: false,
    adminAccess: false,
    activeSessionCount: 1,
    hasProfile: true,
  }
  const props = { isSelf: false, activeAdminCount: 2, canManagePermissions: true }

  it('offers it on a staff account, and sends the change to the API', async () => {
    patch.mockResolvedValue({})
    const user = userEvent.setup()
    render(<UserActions user={account} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Give access' }))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0]![0]).toBe(`/api/v1/users/${account.id}/admin-access`)
    expect(patch.mock.calls[0]![1]).toEqual({ adminAccess: true })
  })

  it('offers to take it back when they have it', () => {
    render(<UserActions user={{ ...account, adminAccess: true }} {...props} />)
    expect(screen.getByRole('button', { name: 'Take away' })).toBeTruthy()
    expect(screen.getByText(/can also work in the office portal/)).toBeTruthy()
  })

  it('is offered to nobody else, and never to yourself', () => {
    const { unmount } = render(<UserActions user={{ ...account, role: 'ADMIN' }} {...props} />)
    expect(screen.getByRole('button', { name: 'Give access' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/already an administrator/)).toBeTruthy()
    unmount()

    const second = render(<UserActions user={{ ...account, role: 'STUDENT' }} {...props} />)
    expect(screen.getByRole('button', { name: 'Give access' }).hasAttribute('disabled')).toBe(true)
    second.unmount()

    render(<UserActions user={account} {...props} isSelf />)
    expect(screen.getByRole('button', { name: 'Give access' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/your own office access/)).toBeTruthy()
  })
})

describe('the badge on the account', () => {
  it('says a staff member also works in the office, and says nothing extra otherwise', () => {
    const { unmount } = render(<RoleBadge role="STAFF" adminAccess />)
    expect(screen.getByText('+ Office')).toBeTruthy()
    unmount()

    render(<RoleBadge role="STAFF" />)
    expect(screen.queryByText('+ Office')).toBeNull()
  })
})

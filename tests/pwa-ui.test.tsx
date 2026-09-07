// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

/**
 * The offline story on screen: a banner that comes and goes with the
 * connection, a submit that refuses to try while offline and says why, and
 * an API client that fails at once instead of after a timeout.
 */

const { OfflineBanner } = await import('@/components/pwa/offline-banner')
const { OnlineOnlyButton } = await import('@/components/pwa/online-only-button')
const { api, ApiError } = await import('@/lib/api-client')

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  })
}

afterEach(() => {
  cleanup()
  setOnline(true)
  vi.restoreAllMocks()
})

describe('the offline banner', () => {
  it('is absent while online and appears the moment the connection drops', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    setOnline(false)
    expect(screen.getByRole('status').textContent).toMatch(/You are offline/)
    setOnline(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('a submit that needs the server', () => {
  it('is disabled offline and says why, and works again when back', () => {
    const onClick = vi.fn()
    render(<OnlineOnlyButton onClick={onClick}>Submit attendance</OnlineOnlyButton>)
    const button = screen.getByRole('button', { name: 'Submit attendance' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    setOnline(false)
    expect(button.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/once the connection is back/)
    setOnline(true)
    expect(button.disabled).toBe(false)
  })
})

describe('the API client while offline', () => {
  it('fails at once with a plain sentence rather than waiting for a timeout', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    setOnline(false)
    await expect(api.get('/api/v1/audit')).rejects.toMatchObject({ code: 'OFFLINE', status: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    let caught: unknown
    try {
      await api.post('/api/v1/auth/logout')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as Error).message).toMatch(/offline/i)
  })
})

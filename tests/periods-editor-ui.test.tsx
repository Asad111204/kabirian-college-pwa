// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Editing the college day.
 *
 * The times used to be a constant in the code with one period marked as the
 * break. Both are gone. What matters here: the office sees the day it is
 * actually running, can change a bell, cannot save nothing, and is told in
 * words when the server refuses — which it does when a period still has
 * lessons or registers against its number.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const put = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { ...actual.api, put } }
})

const { PeriodsEditor } = await import('@/features/timetable/periods-editor')
const { ApiError } = await import('@/lib/api-client')

const DAY = [
  { period: 1, start: '08:00', end: '08:30' },
  { period: 2, start: '08:30', end: '09:00' },
  { period: 3, start: '09:10', end: '10:00' },
]

afterEach(cleanup)

const show = () => render(<PeriodsEditor initial={DAY} />)
const saveButton = () => screen.getByRole('button', { name: 'Save the day' })

describe('the college day', () => {
  it('shows the periods the college is running, with their times', () => {
    show()
    const table = within(screen.getByRole('table'))
    expect((table.getByLabelText('Start time for period 3') as HTMLInputElement).value).toBe('09:10')
    expect((table.getByLabelText('End time for period 3') as HTMLInputElement).value).toBe('10:00')
    expect(screen.getByText('3 periods in the day')).toBeTruthy()
  })

  it('says plainly that there is no break any more', () => {
    show()
    expect(screen.getByText(/There is no break period any more/i)).toBeTruthy()
  })

  it('offers nothing to save until something is changed', async () => {
    show()
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    await userEvent.setup().clear(screen.getByLabelText('End time for period 3'))
    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(false))
  })

  it('sends the whole day, not the one row that changed', async () => {
    const user = userEvent.setup()
    put.mockResolvedValue([...DAY.slice(0, 2), { period: 3, start: '09:10', end: '10:10' }])
    show()

    const end = screen.getByLabelText('End time for period 3')
    await user.clear(end)
    await user.type(end, '10:10')
    await user.click(saveButton())

    await waitFor(() => expect(put).toHaveBeenCalled())
    // The most recent call rather than the first: the mock's history is not
    // cleared between tests, because clearing it made the runner treat a
    // rejection the component catches as an unhandled one.
    const call = put.mock.calls.at(-1)!
    expect(call[0]).toBe('/api/v1/timetable/periods')
    const sent = call[1] as { periods: { period: number; end: string }[] }
    expect(sent.periods).toHaveLength(3)
    expect(sent.periods[2]).toEqual({ period: 3, start: '09:10', end: '10:10' })
  })

  it('adds a period after the last one, carrying on from where it ended', async () => {
    show()
    await userEvent.setup().click(screen.getByRole('button', { name: /Add a period/i }))
    expect(screen.getByText('4 periods in the day')).toBeTruthy()
    expect((screen.getByLabelText('Start time for period 4') as HTMLInputElement).value).toBe('10:00')
  })

  it('removes a period, but never the last one standing', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Remove period 3' }))
    await user.click(screen.getByRole('button', { name: 'Remove period 2' }))
    expect(screen.getByText('1 period in the day')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove period 1' }).hasAttribute('disabled')).toBe(true)
  })

  it('puts back what was there when the office changes its mind', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Remove period 3' }))
    expect(screen.getByText('2 periods in the day')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Undo changes/i }))
    expect(screen.getByText('3 periods in the day')).toBeTruthy()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('shows the server’s refusal in its own words, and keeps the edit on screen', async () => {
    // One rejected promise, marked as handled here before the component is
    // given it. Without that, the runner sees a rejection it did not watch
    // being created and fails the test with the very error the component is
    // supposed to be catching — which it does catch, and this test proves.
    const refusal = Promise.reject(
      new ApiError('Period 3 cannot be removed: it still has a lesson on the timetable.', 409, 'CONFLICT', {
        periods: ['Period 3 is still in use by a lesson on the timetable.'],
      }),
    )
    refusal.catch(() => {})
    put.mockImplementation(() => refusal)
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'Remove period 3' }))
    await user.click(saveButton())

    expect(await screen.findByText(/Period 3 cannot be removed/i)).toBeTruthy()
    expect(screen.getByText(/still in use by a lesson/i)).toBeTruthy()
    // The office's edit is still there to correct, not thrown away.
    expect(screen.getByText('2 periods in the day')).toBeTruthy()
  })
})

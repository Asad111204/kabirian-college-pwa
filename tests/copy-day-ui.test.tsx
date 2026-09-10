// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Copying one day of the week onto others.
 *
 * A college week repeats — Monday, Wednesday and Friday are often the same day
 * three times. What matters here: a day is never offered as a copy of itself,
 * nothing is sent until a target is chosen, the office has to say out loud
 * that it means to overwrite, and every reason a lesson could not be copied is
 * shown rather than swallowed.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const post = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { ...actual.api, post } }
})

const { CopyDayDialog } = await import('@/features/timetable/copy-day-dialog')

const onCopied = vi.fn()

function open() {
  return render(
    <CopyDayDialog
      open
      onOpenChange={vi.fn()}
      sectionId="section-1"
      sectionLabel="1st Year · Girls · Pre-Medical · Section A"
      onCopied={onCopied}
    />,
  )
}

const tick = (label: string) => screen.getByRole('checkbox', { name: label })

afterEach(cleanup)

describe('copying a day', () => {
  it('offers every other day, and never the one being copied', () => {
    open()
    expect(screen.queryByRole('checkbox', { name: 'Monday' })).toBeNull()
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      expect(tick(day)).toBeTruthy()
    }
  })

  it('moves the excluded day when the source changes', async () => {
    const user = userEvent.setup()
    open()
    await user.selectOptions(screen.getByRole('combobox'), 'WEDNESDAY')
    expect(screen.queryByRole('checkbox', { name: 'Wednesday' })).toBeNull()
    expect(tick('Monday')).toBeTruthy()
  })

  it('cannot be run until a day is chosen to copy on to', async () => {
    open()
    expect(screen.getByRole('button', { name: /Copy Monday/ }).hasAttribute('disabled')).toBe(true)

    await userEvent.setup().click(tick('Wednesday'))
    expect(screen.getByRole('button', { name: /Copy Monday/ }).hasAttribute('disabled')).toBe(false)
  })

  it('sends the source, the targets and whether to overwrite', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ copied: 6, cleared: 0, skipped: [], occupied: [] })
    open()

    await user.click(tick('Wednesday'))
    await user.click(tick('Friday'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const call = post.mock.calls.at(-1)!
    expect(call[0]).toBe('/api/v1/timetable/copy-day')
    expect(call[1]).toEqual({
      sectionId: 'section-1',
      fromDay: 'MONDAY',
      toDays: ['WEDNESDAY', 'FRIDAY'],
      replace: false,
    })
  })

  it('only overwrites when the office says so out loud', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ copied: 6, cleared: 6, skipped: [], occupied: [] })
    open()

    await user.click(tick('Wednesday'))
    await user.click(tick('Replace what is already there'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect((post.mock.calls.at(-1)![1] as { replace: boolean }).replace).toBe(true)
  })

  it('says which days were left alone because they already had lessons', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ copied: 0, cleared: 0, skipped: [], occupied: ['WEDNESDAY', 'FRIDAY'] })
    open()

    await user.click(tick('Wednesday'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    expect(await screen.findByText('Some days already had lessons')).toBeTruthy()
    expect(screen.getByText(/Wednesday, Friday/)).toBeTruthy()
  })

  it('shows every lesson that could not be copied, and why', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({
      copied: 5,
      cleared: 0,
      skipped: ['Wednesday, period 3: Biology with Miss Nadia — This teacher is already taking another lesson in this period.'],
      occupied: [],
    })
    open()

    await user.click(tick('Wednesday'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    expect(await screen.findByText('1 could not be copied')).toBeTruthy()
    expect(screen.getByText(/already taking another lesson/)).toBeTruthy()
    // The five that did go across are still reported as done.
    expect(screen.getByText('5 lessons copied')).toBeTruthy()
  })

  it('reloads the week only when something was actually copied', async () => {
    const user = userEvent.setup()
    onCopied.mockClear()
    post.mockResolvedValue({ copied: 0, cleared: 0, skipped: [], occupied: ['WEDNESDAY'] })
    open()

    await user.click(tick('Wednesday'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    await screen.findByText('Some days already had lessons')
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('keeps the form on screen when the copy fails', async () => {
    const user = userEvent.setup()
    const { ApiError } = await import('@/lib/api-client')
    const refusal = Promise.reject(new ApiError('There is nothing on Monday to copy.', 409, 'CONFLICT'))
    refusal.catch(() => {})
    post.mockImplementation(() => refusal)
    open()

    await user.click(tick('Wednesday'))
    await user.click(screen.getByRole('button', { name: /Copy Monday/ }))

    expect(await screen.findByText('There is nothing on Monday to copy.')).toBeTruthy()
    expect((tick('Wednesday') as HTMLInputElement).checked).toBe(true)
  })
})

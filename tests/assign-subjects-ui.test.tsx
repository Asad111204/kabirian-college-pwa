// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Assigning a teacher to several sections and subjects in one go.
 *
 * The rules this screen has to make visible: that sections from different
 * classes and programs can be ticked together, that the subjects offered are
 * the ones those sections are actually taught, that the office is told how
 * many assignments a save will make before it makes them, and — the one that
 * matters most — that a pairing the curriculum refuses is reported rather than
 * swallowed.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

const post = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { ...actual.api, post } }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

// Imported after the mocks: a static import is hoisted above them.
const { AssignSubjectsDialog } = await import('@/features/staff/assign-subjects-dialog')
const { ApiError } = await import('@/lib/api-client')

const SESSIONS = [{ id: 'session-1', name: '2026-27', isCurrent: true }]

const GROUPS = [
  {
    academicGroupId: 'g1',
    classId: 'c1',
    className: '1st Year',
    classLevel: 11,
    divisionId: 'd1',
    divisionName: 'Girls',
    programId: 'p1',
    programName: 'Pre-Medical',
    sections: [{ id: 's1', name: 'A', inchargeName: 'Miss Nadia' }],
    subjects: [
      { id: 'sub-bio', name: 'Biology', code: 'BIO' },
      { id: 'sub-eng', name: 'English', code: 'ENG' },
    ],
  },
  {
    academicGroupId: 'g2',
    classId: 'c2',
    className: '2nd Year',
    classLevel: 12,
    divisionId: 'd2',
    divisionName: 'Boys',
    programId: 'p2',
    programName: 'ICS Physics',
    sections: [{ id: 's2', name: 'A', inchargeName: null }],
    subjects: [
      { id: 'sub-eng', name: 'English', code: 'ENG' },
      { id: 'sub-comp', name: 'Computer', code: 'COMP' },
    ],
  },
]

beforeEach(() => {
  post.mockReset()
  refresh.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ data: GROUPS }) })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function open() {
  return render(
    <AssignSubjectsDialog staffId="staff-1" staffName="Sir Arish" sessions={SESSIONS} onClose={vi.fn()} />,
  )
}

/** The tick box with this label, wherever the dialog puts it. */
const tick = (label: string | RegExp) => screen.getByRole('checkbox', { name: label })

describe('assigning subjects to a teacher', () => {
  it('lists every section under its class, division and program — no cascade to walk', async () => {
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')
    expect(screen.getByText('2nd Year · Boys · ICS Physics')).toBeTruthy()
    expect(screen.getAllByRole('checkbox', { name: /Section A/ })).toHaveLength(2)
  })

  it('offers no subjects until a section says which are taught', async () => {
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')
    expect(screen.getByText('Choose sections first — the subjects are theirs.')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Biology' })).toBeNull()
  })

  it('offers each ticked section its own curriculum, separately', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    expect(tick('Biology')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Computer' })).toBeNull()

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[1]!)
    // English is on both curricula, so it appears once under each section
    // rather than once for the pair — the subjects are chosen per section.
    expect(screen.getAllByRole('checkbox', { name: 'English' })).toHaveLength(2)
    expect(screen.getAllByRole('checkbox', { name: 'Computer' })).toHaveLength(1)
  })

  it('lets a teacher take two subjects in one class and one in another', async () => {
    // The college's own case: English and Urdu in one class, English alone in
    // the next, where the other subject belongs to somebody else.
    const user = userEvent.setup()
    post.mockResolvedValue({ created: [], alreadyHeld: [], refused: [] })
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    for (const box of screen.getAllByRole('checkbox', { name: /Section A/ })) await user.click(box)

    const [bio] = screen.getAllByRole('checkbox', { name: 'Biology' })
    const [firstEnglish, secondEnglish] = screen.getAllByRole('checkbox', { name: 'English' })
    await user.click(bio!)
    await user.click(firstEnglish!)
    await user.click(secondEnglish!)

    expect(screen.getByText('3 assignments will be made.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0]![1]).toEqual({
      academicSessionId: 'session-1',
      sections: [
        { sectionId: 's1', subjectIds: ['sub-bio', 'sub-eng'] },
        { sectionId: 's2', subjectIds: ['sub-eng'] },
      ],
    })
  })

  it('copies the first section’s subjects onto the rest when asked', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    for (const box of screen.getAllByRole('checkbox', { name: /Section A/ })) await user.click(box)
    await user.click(screen.getAllByRole('checkbox', { name: 'English' })[0]!)
    expect(screen.getByText('1 assignment will be made.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'same as the first' }))
    expect(screen.getByText('2 assignments will be made.')).toBeTruthy()
  })

  it('says how many assignments the save will make before making them', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')
    expect(screen.getByText('Nothing chosen yet.')).toBeTruthy()

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    await user.click(tick('English'))
    expect(screen.getByText('1 assignment will be made.')).toBeTruthy()

    await user.click(tick('Biology'))
    expect(screen.getByText('2 assignments will be made.')).toBeTruthy()
  })

  it('takes a whole year in one press, for a subject everybody studies', async () => {
    // English is taken by every section of 1st Year. Ticking them one at a
    // time is the chore this button exists to remove.
    const user = userEvent.setup()
    post.mockResolvedValue({ created: [], alreadyHeld: [], refused: [] })
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getByRole('button', { name: 'All 1st Year' }))
    expect(screen.getByText('1 chosen')).toBeTruthy()

    // Its subjects are then set once and copied down.
    await user.click(screen.getAllByRole('checkbox', { name: 'English' })[0]!)
    expect(screen.getByText('1 assignment will be made.')).toBeTruthy()
  })

  it('cannot be saved with nothing chosen', async () => {
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')
    expect(screen.getByRole('button', { name: 'Assign' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends only the pairings that were ticked, and nothing else', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ created: ['1st Year · Girls · Pre-Medical · Section A · Biology'], alreadyHeld: [], refused: [] })
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    await user.click(tick('Biology'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0]![0]).toBe('/api/v1/staff/staff-1/assignments')
    expect(post.mock.calls[0]![1]).toEqual({
      academicSessionId: 'session-1',
      sections: [{ sectionId: 's1', subjectIds: ['sub-bio'] }],
    })
  })

  it('shows what was made, what was already held, and what the curriculum refused', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({
      created: ['1st Year · Girls · Pre-Medical · Section A · Biology'],
      alreadyHeld: ['1st Year · Girls · Pre-Medical · Section A · English'],
      refused: ['2nd Year · Boys · ICS Physics · Section A · Biology — not in the 2nd Year · ICS Physics curriculum'],
    })
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    await user.click(tick('Biology'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    const assigned = await screen.findByText('1 assigned')
    expect(assigned).toBeTruthy()
    expect(screen.getByText('1 already held')).toBeTruthy()
    expect(screen.getByText('1 not in the curriculum')).toBeTruthy()
    expect(screen.getByText(/not in the 2nd Year · ICS Physics curriculum/)).toBeTruthy()
  })

  it('does not refresh the page when nothing new was assigned', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ created: [], alreadyHeld: ['already there'], refused: [] })
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    await user.click(tick('Biology'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await screen.findByText('1 already held')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps the office on the form when the save fails, with the ticks still there', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(new ApiError('Sir Arish is recorded as support staff.', 409, 'CONFLICT'))
    open()
    await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(screen.getAllByRole('checkbox', { name: /Section A/ })[0]!)
    await user.click(tick('Biology'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await screen.findByText('Sir Arish is recorded as support staff.')
    expect((tick('Biology') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('1 assignment will be made.')).toBeTruthy()
  })

  it('ticks a whole group at once when it has more than one section', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              ...GROUPS[0],
              sections: [
                { id: 's1', name: 'A', inchargeName: null },
                { id: 's1b', name: 'B', inchargeName: null },
              ],
            },
          ],
        }),
      })),
    )
    open()
    const heading = await screen.findByText('1st Year · Girls · Pre-Medical')

    await user.click(within(heading.parentElement!).getByRole('button', { name: 'all' }))
    expect(screen.getByText('2 chosen')).toBeTruthy()
  })
})

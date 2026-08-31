// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The teacher's marks screens.
 *
 * These check the rules the screen is supposed to make visible: that an empty
 * box is *not entered* rather than a zero, that Absent is its own control, that
 * a submitted sheet offers no editing at all, and — the one that matters most —
 * that a failed save leaves every mark the teacher typed on screen.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

const post = vi.fn()
const patch = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return {
    ...actual,
    api: { get: vi.fn(), post, patch, put: vi.fn(), delete: vi.fn() },
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { MarkSheetView } = await import('@/features/marks/mark-sheet-view')
const { MyPapers } = await import('@/features/marks/my-papers')
const { MarkSheetMonitor } = await import('@/features/marks/mark-sheet-monitor')
const { markLabel, progressLabel } = await import('@/features/marks/shared')
const { ApiError } = await import('@/lib/api-client')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */

type Mark = {
  studentId: string
  studentCode: string
  fullName: string
  rollNumber: string | null
  status: 'PENDING' | 'ENTERED' | 'ABSENT'
  obtainedMarks: string | null
  remarks: string | null
}

const student = (n: number, over: Partial<Mark> = {}): Mark => ({
  studentId: `student-${n}`,
  studentCode: `STU-000${n}`,
  fullName: `Student ${n}`,
  rollNumber: String(n),
  status: 'PENDING',
  obtainedMarks: null,
  remarks: null,
  ...over,
})

function sheet(over: Record<string, unknown> = {}) {
  const marks = (over.marks as Mark[]) ?? [student(1), student(2), student(3)]
  const counts = {
    total: marks.length,
    entered: marks.filter((m) => m.status === 'ENTERED').length,
    absent: marks.filter((m) => m.status === 'ABSENT').length,
    pending: marks.filter((m) => m.status === 'PENDING').length,
  }
  return {
    id: 'sheet-1',
    examId: 'exam-1',
    examName: 'First Term Examination 2026',
    examTypeName: 'First Term',
    examStatus: 'MARKS_ENTRY',
    academicSessionId: 'session-1',
    sessionName: '2026-27',
    examPaperId: 'paper-1',
    subjectId: 'biology',
    subjectName: 'Biology',
    classId: 'class-1',
    className: '1st Year',
    programId: 'premed',
    programName: 'Pre-Medical',
    examDate: '2026-05-12',
    startTime: '09:00',
    endTime: '12:00',
    maxMarks: '100.00',
    passingPercentage: '50.00',
    sectionId: 'section-1',
    sectionName: 'A',
    divisionName: 'Boys',
    status: 'DRAFT',
    enteredByStaffId: 'staff-1',
    enteredByName: 'Sara Khan',
    submittedAt: null,
    updatedAt: '2026-08-31T10:00:00.000Z',
    counts,
    marks,
    canEdit: true,
    canSubmit: true,
    ...over,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const marksBoxFor = (name: string) => screen.getByLabelText(`Marks for ${name}`) as HTMLInputElement
const absentButtonFor = (name: string) => screen.getByLabelText(`Mark ${name} absent`)

/** Reads one tile of the counts summary by its label. */
function tile(label: string): string {
  const term = screen.getAllByText(label).find((el) => el.tagName === 'DT')
  return term?.nextElementSibling?.textContent ?? ''
}

/* -------------------------------------------------------------------------- */

describe('the paper each mark is shown against', () => {
  it('shows a dash for a mark nobody has entered', () => {
    expect(markLabel('PENDING', null)).toBe('—')
  })

  it('says "Absent" rather than 0', () => {
    // The number 0 and an absence are different facts, and the screen says so.
    expect(markLabel('ABSENT', '0.00')).toBe('Absent')
  })

  it('shows an entered mark without pointless decimals', () => {
    expect(markLabel('ENTERED', '75.00')).toBe('75')
    expect(markLabel('ENTERED', '47.50')).toBe('47.50')
  })

  it('counts absences towards progress, because they are dealt with', () => {
    expect(progressLabel({ total: 30, entered: 27, absent: 2, pending: 1 })).toBe('29 of 30 marked')
  })
})

/* -------------------------------------------------------------------------- */

describe('the teacher’s paper list', () => {
  const paper = (over: Record<string, unknown> = {}) => ({
    examId: 'exam-1',
    examName: 'First Term Examination 2026',
    examTypeName: 'First Term',
    examStatus: 'SCHEDULED',
    academicSessionId: 'session-1',
    sessionName: '2026-27',
    examPaperId: 'paper-1',
    subjectId: 'biology',
    subjectName: 'Biology',
    classId: 'class-1',
    className: '1st Year',
    programId: 'premed',
    programName: 'Pre-Medical',
    examDate: '2026-05-12',
    startTime: '09:00',
    endTime: '12:00',
    maxMarks: '100.00',
    passingPercentage: '50.00',
    sectionId: 'section-1',
    sectionName: 'A',
    divisionName: 'Boys',
    studentCount: 30,
    sheet: null,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  it('says plainly when a teacher has nothing to mark', () => {
    render(<MyPapers papers={[]} />)
    expect(screen.getByText('No papers to mark')).toBeTruthy()
    // And points at the reason, rather than looking broken.
    expect(screen.getByText(/teaching assignments/)).toBeTruthy()
  })

  it('lists a paper with its subject, section and exam', () => {
    render(<MyPapers papers={[paper()]} />)
    expect(screen.getByText('First Term Examination 2026')).toBeTruthy()
    expect(screen.getByText('Biology')).toBeTruthy()
    expect(screen.getByText(/1st Year · Boys · A/)).toBeTruthy()
    expect(screen.getByText('Not started')).toBeTruthy()
    expect(screen.getByText('30 students')).toBeTruthy()
  })

  it('offers to continue a draft and only to view a submitted sheet', () => {
    const { unmount } = render(
      <MyPapers
        papers={[
          paper({
            sheet: {
              id: 'sheet-1',
              status: 'DRAFT',
              submittedAt: null,
              counts: { total: 30, entered: 10, absent: 0, pending: 20 },
            },
          }),
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: /Continue/ })).toBeTruthy()
    expect(screen.getByText('10 of 30 marked')).toBeTruthy()
    unmount()

    render(
      <MyPapers
        papers={[
          paper({
            sheet: {
              id: 'sheet-1',
              status: 'SUBMITTED',
              submittedAt: '2026-05-13T09:00:00.000Z',
              counts: { total: 30, entered: 28, absent: 2, pending: 0 },
            },
          }),
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: /View/ })).toBeTruthy()
    expect(screen.getByText('Submitted')).toBeTruthy()
  })

  it('opens a sheet through the server, never by guessing a URL', async () => {
    const user = userEvent.setup()
    post.mockResolvedValueOnce({ id: 'sheet-9' })
    render(<MyPapers papers={[paper()]} />)

    await user.click(screen.getByRole('button', { name: /Enter marks/ }))

    expect(post).toHaveBeenCalledWith('/api/v1/marks/sheets', {
      examPaperId: 'paper-1',
      sectionId: 'section-1',
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/staff/exams/sheet-9'))
  })

  it('says so when the sheet cannot be opened', async () => {
    const user = userEvent.setup()
    post.mockRejectedValueOnce(new ApiError('You are not assigned to teach this subject.', 403, 'FORBIDDEN'))
    render(<MyPapers papers={[paper()]} />)

    await user.click(screen.getByRole('button', { name: /Enter marks/ }))

    expect(await screen.findByText('You are not assigned to teach this subject.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */

describe('the mark sheet', () => {
  it('shows the paper it belongs to, including its own maximum and pass rule', () => {
    render(<MarkSheetView sheet={sheet()} />)
    expect(screen.getByText('First Term Examination 2026')).toBeTruthy()
    expect(screen.getByText('Biology')).toBeTruthy()
    expect(screen.getByText(/1st Year · Boys · Pre-Medical · Section A/)).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('says so when nobody is enrolled', () => {
    render(<MarkSheetView sheet={sheet({ marks: [] })} />)
    expect(screen.getByText('No students in this section')).toBeTruthy()
  })

  it('starts every unmarked student empty, not at zero', () => {
    render(<MarkSheetView sheet={sheet()} />)
    for (const name of ['Student 1', 'Student 2', 'Student 3']) {
      expect(marksBoxFor(name).value).toBe('')
    }
    expect(screen.getAllByText('Not entered').length).toBeGreaterThan(0)
  })

  it('shows an entered mark, an absence and a blank as three different things', () => {
    render(
      <MarkSheetView
        sheet={sheet({
          marks: [
            student(1, { status: 'ENTERED', obtainedMarks: '75.00' }),
            student(2, { status: 'ABSENT', obtainedMarks: '0.00' }),
            student(3),
          ],
        })}
      />,
    )
    expect(marksBoxFor('Student 1').value).toBe('75.00')
    // An absent student's box is empty and disabled — never showing a 0 that
    // could be mistaken for a mark they scored.
    expect(marksBoxFor('Student 2').value).toBe('')
    expect(marksBoxFor('Student 2').disabled).toBe(true)
    expect(absentButtonFor('Student 2').getAttribute('aria-pressed')).toBe('true')
    expect(marksBoxFor('Student 3').value).toBe('')
    expect(marksBoxFor('Student 3').disabled).toBe(false)
  })

  it('counts entered, absent and unmarked separately, and follows the typing', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)

    expect(tile('Students')).toBe('3')
    expect(tile('Entered')).toBe('0')
    expect(tile('Not entered')).toBe('3')

    await user.type(marksBoxFor('Student 1'), '75')
    await user.click(absentButtonFor('Student 2'))

    // The tiles follow what is on screen, not what was last saved.
    expect(tile('Entered')).toBe('1')
    expect(tile('Absent')).toBe('1')
    expect(tile('Not entered')).toBe('1')
    expect(screen.getByText(/1 student has no mark yet/)).toBeTruthy()
  })

  it('accepts decimal marks', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)
    await user.type(marksBoxFor('Student 1'), '47.5')
    expect(marksBoxFor('Student 1').value).toBe('47.5')
    expect(screen.queryByText(/at most two decimal places/)).toBeNull()
  })

  it('refuses a mark above the paper’s maximum before the server has to', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)
    await user.type(marksBoxFor('Student 1'), '100.01')
    expect(await screen.findByText('The most this paper carries is 100.00.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save draft' }).hasAttribute('disabled')).toBe(true)
  })

  it('refuses a third decimal place', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)
    await user.type(marksBoxFor('Student 1'), '47.555')
    expect(await screen.findByText('Use a number with at most two decimal places.')).toBeTruthy()
  })

  it('clears a typed mark when the student is marked absent', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)
    await user.type(marksBoxFor('Student 1'), '60')
    await user.click(absentButtonFor('Student 1'))
    expect(marksBoxFor('Student 1').value).toBe('')
    expect(marksBoxFor('Student 1').disabled).toBe(true)
  })

  it('un-marks an absence as soon as a mark is typed', async () => {
    const user = userEvent.setup()
    render(
      <MarkSheetView
        sheet={sheet({ marks: [student(1, { status: 'ABSENT', obtainedMarks: '0.00' })] })}
      />,
    )
    await user.click(absentButtonFor('Student 1'))
    await user.type(marksBoxFor('Student 1'), '40')
    expect(absentButtonFor('Student 1').getAttribute('aria-pressed')).toBe('false')
  })
})

/* -------------------------------------------------------------------------- */

describe('saving a draft', () => {
  it('keeps Save disabled until something changes', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={sheet()} />)

    const save = () => screen.getByRole('button', { name: 'Save draft' })
    expect(save().hasAttribute('disabled')).toBe(true)

    await user.type(marksBoxFor('Student 1'), '75')
    expect(save().hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('sends every row, with the sheet timestamp it loaded', async () => {
    const user = userEvent.setup()
    patch.mockResolvedValueOnce(
      sheet({ marks: [student(1, { status: 'ENTERED', obtainedMarks: '75.00' }), student(2), student(3)] }),
    )
    render(<MarkSheetView sheet={sheet()} />)

    await user.type(marksBoxFor('Student 1'), '75')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(patch).toHaveBeenCalledWith('/api/v1/marks/sheets/sheet-1', {
      expectedUpdatedAt: '2026-08-31T10:00:00.000Z',
      rows: [
        { studentId: 'student-1', status: 'ENTERED', obtainedMarks: '75' },
        { studentId: 'student-2', status: 'PENDING', obtainedMarks: '' },
        { studentId: 'student-3', status: 'PENDING', obtainedMarks: '' },
      ],
    })
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('sends an absence as zero, with the status saying why', async () => {
    const user = userEvent.setup()
    patch.mockResolvedValueOnce(sheet())
    render(<MarkSheetView sheet={sheet({ marks: [student(1)] })} />)

    await user.click(absentButtonFor('Student 1'))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      rows: [{ studentId: 'student-1', status: 'ABSENT', obtainedMarks: '0' }],
    })
  })

  it('keeps every typed mark on screen when the save fails', async () => {
    const user = userEvent.setup()
    patch.mockRejectedValueOnce(new ApiError('The server is unreachable.', 0, 'NETWORK_ERROR'))
    render(<MarkSheetView sheet={sheet()} />)

    await user.type(marksBoxFor('Student 1'), '75')
    await user.type(marksBoxFor('Student 2'), '62.5')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('The server is unreachable.')).toBeTruthy()
    // Nothing the teacher typed is thrown away by a failed request.
    expect(marksBoxFor('Student 1').value).toBe('75')
    expect(marksBoxFor('Student 2').value).toBe('62.5')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('reports a conflict rather than claiming success', async () => {
    const user = userEvent.setup()
    patch.mockRejectedValueOnce(
      new ApiError('Somebody else changed this mark sheet while you were working on it.', 409, 'CONFLICT'),
    )
    render(<MarkSheetView sheet={sheet()} />)

    await user.type(marksBoxFor('Student 1'), '75')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText(/Somebody else changed this mark sheet/)).toBeTruthy()
    expect(screen.getByText('Not saved')).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */

describe('submitting', () => {
  const complete = () =>
    sheet({
      marks: [
        student(1, { status: 'ENTERED', obtainedMarks: '75.00' }),
        student(2, { status: 'ABSENT', obtainedMarks: '0.00' }),
      ],
    })

  it('will not submit while anybody is unmarked', () => {
    render(<MarkSheetView sheet={sheet()} />)
    expect(screen.getByRole('button', { name: /Submit/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/3 students have no mark yet/)).toBeTruthy()
  })

  it('allows submission once every student is entered or absent', () => {
    render(<MarkSheetView sheet={complete()} />)
    expect(screen.getByRole('button', { name: /Submit/ }).hasAttribute('disabled')).toBe(false)
  })

  it('asks first, and warns that it cannot be undone', async () => {
    const user = userEvent.setup()
    render(<MarkSheetView sheet={complete()} />)

    await user.click(screen.getByRole('button', { name: /Submit/ }))

    expect(await screen.findByRole('heading', { name: 'Submit marks?' })).toBeTruthy()
    expect(screen.getByText(/will not be able to edit this mark sheet/)).toBeTruthy()
  })

  it('submits after confirmation', async () => {
    const user = userEvent.setup()
    post.mockResolvedValueOnce(complete())
    render(<MarkSheetView sheet={complete()} />)

    await user.click(screen.getByRole('button', { name: /Submit/ }))
    await user.click(await screen.findByRole('button', { name: 'Submit marks' }))

    expect(post).toHaveBeenCalledWith('/api/v1/marks/sheets/sheet-1/submit')
  })

  it('saves first when there are unsaved marks', async () => {
    const user = userEvent.setup()
    patch.mockResolvedValueOnce(complete())
    post.mockResolvedValueOnce(complete())
    render(
      <MarkSheetView
        sheet={sheet({ marks: [student(1, { status: 'ENTERED', obtainedMarks: '75.00' }), student(2)] })}
      />,
    )

    await user.click(absentButtonFor('Student 2'))
    await user.click(screen.getByRole('button', { name: /Submit/ }))
    await user.click(await screen.findByRole('button', { name: 'Submit marks' }))

    expect(patch).toHaveBeenCalled()
    expect(post).toHaveBeenCalledWith('/api/v1/marks/sheets/sheet-1/submit')
  })

  it('says so when submission fails, without claiming it worked', async () => {
    const user = userEvent.setup()
    post.mockRejectedValueOnce(new ApiError('These marks have already been submitted.', 409, 'CONFLICT'))
    render(<MarkSheetView sheet={complete()} />)

    await user.click(screen.getByRole('button', { name: /Submit/ }))
    await user.click(await screen.findByRole('button', { name: 'Submit marks' }))

    expect(await screen.findByText('These marks have already been submitted.')).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */

describe('a submitted mark sheet', () => {
  const submitted = () =>
    sheet({
      status: 'SUBMITTED',
      submittedAt: '2026-05-13T09:00:00.000Z',
      canEdit: false,
      canSubmit: false,
      marks: [
        student(1, { status: 'ENTERED', obtainedMarks: '75.00' }),
        student(2, { status: 'ABSENT', obtainedMarks: '0.00' }),
      ],
    })

  it('says it was submitted, and when', () => {
    render(<MarkSheetView sheet={submitted()} />)
    expect(screen.getByText('Submitted')).toBeTruthy()
    expect(screen.getByText(/Handed in/)).toBeTruthy()
  })

  it('tells the teacher what to do about a correction', () => {
    render(<MarkSheetView sheet={submitted()} />)
    expect(
      screen.getByText(/Submitted marks cannot be edited. Please contact the administrator/),
    ).toBeTruthy()
  })

  it('offers no editing controls at all', () => {
    render(<MarkSheetView sheet={submitted()} />)
    expect(screen.queryByLabelText('Marks for Student 1')).toBeNull()
    expect(screen.queryByLabelText('Mark Student 1 absent')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Submit/ })).toBeNull()
  })

  it('still shows the marks that were handed in', () => {
    render(<MarkSheetView sheet={submitted()} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('75')).toBeTruthy()
    // Scoped to the student's own row: "Absent" is also a column heading.
    const absentRow = within(table).getByText('Student 2').closest('tr')!
    expect(within(absentRow).getByText('Absent')).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */

describe('the admin’s mark sheet monitor', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    examPaperId: 'paper-1',
    subjectName: 'Biology',
    className: '1st Year',
    programName: 'Pre-Medical',
    sectionId: 'section-1',
    sectionName: 'A',
    divisionName: 'Boys',
    teacherName: 'Sara Khan',
    sheetId: null,
    status: null,
    submittedAt: null,
    counts: { total: 0, entered: 0, absent: 0, pending: 0 },
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  it('says so when there is nothing to monitor', () => {
    render(<MarkSheetMonitor rows={[]} />)
    expect(screen.getByText('Nothing to mark yet')).toBeTruthy()
  })

  it('shows a paper nobody has started as not started', () => {
    render(<MarkSheetMonitor rows={[row()]} />)
    expect(screen.getByText('Not started')).toBeTruthy()
    expect(screen.getByText('Sara Khan')).toBeTruthy()
  })

  it('flags a paper with no teacher assigned', () => {
    render(<MarkSheetMonitor rows={[row({ teacherName: null })]} />)
    expect(screen.getByText('No teacher assigned')).toBeTruthy()
  })

  it('counts how many sheets are in', () => {
    render(
      <MarkSheetMonitor
        rows={[
          row({
            sheetId: 's1',
            status: 'SUBMITTED',
            submittedAt: '2026-05-13T09:00:00.000Z',
            counts: { total: 30, entered: 28, absent: 2, pending: 0 },
          }),
          row({ sectionId: 'section-2', sectionName: 'B', sheetId: 's2', status: 'DRAFT', counts: { total: 30, entered: 10, absent: 0, pending: 20 } }),
          row({ sectionId: 'section-3', sectionName: 'C' }),
        ]}
      />,
    )
    expect(screen.getByText(/1 of 3 mark sheets submitted, 1 still in draft/)).toBeTruthy()
  })

  it('shows no marks, only progress', () => {
    render(
      <MarkSheetMonitor
        rows={[row({ sheetId: 's1', status: 'DRAFT', counts: { total: 30, entered: 10, absent: 2, pending: 18 } })]}
      />,
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('30')).toBeTruthy()
    expect(within(table).getByText('18')).toBeTruthy()
  })
})

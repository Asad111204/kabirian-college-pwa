// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

/**
 * The student and staff result screens.
 *
 * Both are read-only, and both show a *stored snapshot*. These check the rules
 * a reader depends on: that an incomplete result shows no percentage, grade or
 * position; that an absence is shown as an absence rather than as a zero; that
 * a teacher's table carries only their own subject; and that neither screen
 * offers a control that would change anything.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

const post = vi.fn()
const patch = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return { ...actual, api: { get: vi.fn(), post, patch, put, delete: del } }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { StudentResults } = await import('@/features/results/student-results')
const { ResultCard } = await import('@/features/results/result-card')
const { TeacherResults } = await import('@/features/results/teacher-results')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Anything that would change a result. None of it belongs on these screens.
 *
 * Word-bounded on purpose: a card reading "published 20 May 2026" is a date,
 * not a Publish button.
 */
const MUTATION_WORDS =
  /\b(edit|delete|remove|publish|withdraw|generate|regenerate|submit|correct|save)\b/i

function expectNoMutationControls() {
  for (const button of screen.queryAllByRole('button')) {
    expect(button.textContent ?? '').not.toMatch(MUTATION_WORDS)
  }
  for (const link of screen.queryAllByRole('link')) {
    expect(link.textContent ?? '').not.toMatch(MUTATION_WORDS)
  }
  expect(post).not.toHaveBeenCalled()
  expect(patch).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
  expect(del).not.toHaveBeenCalled()
}

/* -------------------------------------------------------------------------- */

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'result-1',
    studentId: 'student-1',
    studentCode: 'STU-0001',
    studentName: 'Ali Raza',
    rollNumber: '1',
    examName: 'First Term Examination 2026',
    examTypeName: 'First Term',
    sessionName: '2026-27',
    className: '1st Year',
    divisionName: 'Boys',
    programName: 'Pre-Medical',
    sectionName: 'A',
    totalMaxMarks: '400.00',
    totalObtainedMarks: '360.00',
    percentage: '90.00',
    grade: 'A+',
    outcome: 'PASS',
    position: 1,
    positionScope: 'GROUP',
    status: 'PUBLISHED',
    version: 1,
    publishedAt: '2026-05-20T09:00:00.000Z',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

const subject = (over: Record<string, unknown> = {}) => ({
  examPaperId: `paper-${String(over.subjectName ?? 'x')}`,
  subjectId: String(over.subjectName ?? 'x'),
  subjectName: 'Biology',
  maxMarks: '100.00',
  obtainedMarks: '90.00',
  status: 'ENTERED',
  percentage: '90.00',
  grade: 'A+',
  outcome: 'PASS',
  ...over,
})

const detail = (over: Record<string, unknown> = {}) =>
  ({
    ...row(over),
    examId: 'exam-1',
    fatherName: 'Raza Khan',
    gradeScaleName: 'Kabirian College Scale',
    generatedAt: '2026-05-19T09:00:00.000Z',
    correctionReason: null,
    subjects: [subject()],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

/* -------------------------------------------------------------------------- */

describe('the student result list', () => {
  it('says so plainly when nothing has been published', () => {
    render(<StudentResults results={[]} />)
    expect(screen.getByText('No published results yet')).toBeTruthy()
    expectNoMutationControls()
  })

  it('names each exam and links to it', () => {
    render(<StudentResults results={[row()]} />)
    expect(screen.getByText('First Term Examination 2026')).toBeTruthy()
    expect(screen.getByText(/First Term · 2026-27/)).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/results/result-1')
  })

  it('shows a passing result with its percentage, grade and position', () => {
    render(<StudentResults results={[row()]} />)
    expect(screen.getByText('90.00%')).toBeTruthy()
    expect(screen.getByText('A+')).toBeTruthy()
    expect(screen.getByText('1st')).toBeTruthy()
    expect(screen.getByText('Pass')).toBeTruthy()
  })

  it('shows a failing result with its percentage and grade', () => {
    render(
      <StudentResults
        results={[row({ outcome: 'FAIL', percentage: '38.00', grade: 'F', position: 30 })]}
      />,
    )
    expect(screen.getByText('38.00%')).toBeTruthy()
    expect(screen.getByText('F')).toBeTruthy()
    expect(screen.getByText('Fail')).toBeTruthy()
  })

  it('shows an incomplete result with dashes, never a percentage', () => {
    render(
      <StudentResults
        results={[row({ outcome: 'INCOMPLETE', percentage: null, grade: null, position: null })]}
      />,
    )
    expect(screen.getByText('Incomplete')).toBeTruthy()
    expect(screen.getByText(/not yet complete/)).toBeTruthy()
    // Three dashes: percentage, grade and position.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText(/0\.00%/)).toBeNull()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('offers nothing that would change anything', () => {
    render(<StudentResults results={[row()]} />)
    expectNoMutationControls()
  })
})

/* -------------------------------------------------------------------------- */

describe('the official result card', () => {
  const card = (over: Record<string, unknown> = {}) => (
    <ResultCard result={detail(over)} collegeName="Kabirian College" />
  )

  it('uses the college’s own logo asset', () => {
    render(card())
    const logo = screen.getByRole('img', { name: /Kabirian College logo/i }) as HTMLImageElement
    expect(logo.getAttribute('src')).toBe('/brand/college-logo.jpeg')
    // Never lazy: a logo that has not loaded prints as a blank space.
    expect(logo.getAttribute('loading')).toBe('eager')
  })

  it('heads the card as an official document', () => {
    render(card())
    expect(screen.getByRole('heading', { name: 'Kabirian College' })).toBeTruthy()
    expect(screen.getByText('INSPIRING MINDS SHAPING FUTURE')).toBeTruthy()
    expect(screen.getByText('Result Card')).toBeTruthy()
  })

  it('names the examination and the session', () => {
    render(card())
    expect(screen.getByText('First Term Examination 2026')).toBeTruthy()
    expect(screen.getByText('First Term')).toBeTruthy()
    expect(screen.getByText('2026-27')).toBeTruthy()
  })

  it('shows who it belongs to and where they sat it', () => {
    render(card())
    expect(screen.getByText('Ali Raza')).toBeTruthy()
    expect(screen.getByText('STU-0001')).toBeTruthy()
    expect(screen.getByText('1st Year')).toBeTruthy()
    expect(screen.getByText('Boys')).toBeTruthy()
    expect(screen.getByText('Pre-Medical')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('shows nothing from the student file', () => {
    const { container } = render(card())
    expect(container.innerHTML).not.toMatch(/cnic|b-form|bform|admission number|drive|token/i)
    // Nor any internal identifier.
    expect(container.innerHTML).not.toContain('result-1')
    expect(container.innerHTML).not.toContain('student-1')
  })

  it('renders a row per subject, with the stored marks', () => {
    render(
      card({
        subjects: [
          subject(),
          subject({
            subjectName: 'Chemistry',
            obtainedMarks: '76.00',
            percentage: '76.00',
            grade: 'B',
          }),
        ],
      }),
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('Biology')).toBeTruthy()
    expect(within(table).getByText('Chemistry')).toBeTruthy()
    expect(within(table).getByText('76.00')).toBeTruthy()
    expect(within(table).getByText('76.00%')).toBeTruthy()
    expect(within(table).getByText('B')).toBeTruthy()
  })

  it('shows the stored overall figures for a pass', () => {
    render(card())
    expect(screen.getByText('Total Marks')).toBeTruthy()
    expect(screen.getByText('400')).toBeTruthy()
    expect(screen.getByText('360')).toBeTruthy()
    expect(screen.getAllByText('90.00%').length).toBeGreaterThan(0)
    expect(screen.getByText('PASS')).toBeTruthy()
    expect(screen.getByText('1st')).toBeTruthy()
  })

  it('shows the stored figures for a fail, including the word FAIL', () => {
    render(card({ outcome: 'FAIL', percentage: '38.00', grade: 'F', position: 30 }))
    expect(screen.getByText('FAIL')).toBeTruthy()
    expect(screen.getAllByText('38.00%').length).toBeGreaterThan(0)
    expect(screen.getByText('30th')).toBeTruthy()
  })

  it('shows an incomplete result with dashes and never a percentage', () => {
    render(
      card({
        outcome: 'INCOMPLETE',
        percentage: null,
        grade: null,
        position: null,
        subjects: [
          subject(),
          subject({
            subjectName: 'Chemistry',
            status: 'PENDING',
            obtainedMarks: null,
            percentage: null,
            grade: null,
            outcome: 'PENDING',
          }),
        ],
      }),
    )
    expect(screen.getByText('INCOMPLETE')).toBeTruthy()
    expect(screen.getByText(/Result incomplete/)).toBeTruthy()
    expect(screen.getByText('Your final result is not yet complete.')).toBeTruthy()
    // Never 0% in place of the missing figure.
    expect(screen.queryByText('0.00%')).toBeNull()
    expect(screen.queryByText('0%')).toBeNull()
    // The subject that WAS marked keeps its own figures.
    const table = screen.getByRole('table')
    expect(within(table).getByText('90.00')).toBeTruthy()
    expect(within(table).getAllByText('Not marked').length).toBeGreaterThan(0)
  })

  it('shows an absence as an absence, with its zero and its F', () => {
    render(
      card({
        subjects: [
          subject({
            subjectName: 'Physics',
            status: 'ABSENT',
            obtainedMarks: '0.00',
            percentage: '0.00',
            grade: 'F',
            outcome: 'FAIL',
          }),
        ],
      }),
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('Absent')).toBeTruthy()
    expect(within(table).getByText('0.00')).toBeTruthy()
    expect(within(table).getByText('F')).toBeTruthy()
    // Never reduced to a bare zero with no explanation.
    expect(within(table).queryByText('Fail')).toBeNull()
  })

  it('carries signature areas, unnamed', () => {
    render(card())
    for (const role of ['Class Teacher / Subject Teacher', 'Examination Incharge', 'Principal']) {
      expect(screen.getByText(role)).toBeTruthy()
    }
  })

  it('states where it came from, without claiming to be certified', () => {
    const { container } = render(card())
    expect(
      screen.getByText(
        'This result card is generated from the officially published examination result.',
      ),
    ).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/certified|attested|verified copy/i)
  })

  it('is marked as the print area, so printing yields the card alone', () => {
    const { container } = render(card())
    const article = container.querySelector('article')
    expect(article?.className).toContain('print-area')
    expect(article?.className).toContain('max-w-[210mm]')
  })

  it('renders the logo large, at a size no breakpoint can shrink', () => {
    render(card())
    const logo = screen.getByRole('img', { name: /Kabirian College logo/i })
    const cls = logo.getAttribute('class') ?? ''
    // Fixed in millimetres: a 148mm box paints ~66mm of artwork on A4, inside
    // the 55-75mm the college asked for.
    expect(cls).toContain('w-full')
    expect(cls).toContain('max-w-[148mm]')
    // Nothing about the logo's size sits behind a breakpoint, so paper gets the
    // same logo whether or not the browser applies `sm:` to the page box.
    expect(cls).not.toMatch(/sm:(w-|h-|max-w-|aspect-)/)
  })

  it('shows the official logo without redrawing or distorting it', () => {
    render(card())
    const logo = screen.getByRole('img', { name: /Kabirian College logo/i })
    expect(logo.getAttribute('src')).toBe('/brand/college-logo.jpeg')
    // The file's own pixel dimensions, so the browser scales by its true ratio.
    expect(logo.getAttribute('width')).toBe('1280')
    expect(logo.getAttribute('height')).toBe('960')
    // `cover` scales proportionally and centres: the artwork keeps its shape and
    // only the blank canvas margin around it goes unpainted.
    expect(logo.getAttribute('class')).toContain('object-cover')
  })

  it('keeps every control off the printed area', () => {
    const { container } = render(card())
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    // The Print button and the portal chrome live outside the card, so what the
    // browser prints is the document alone.
    expect(article?.querySelectorAll('button, a, nav, aside')).toHaveLength(0)
    expect(article?.querySelectorAll('.print-hide')).toHaveLength(0)
  })

  it('offers nothing that would change anything', () => {
    render(card())
    expectNoMutationControls()
  })
})

/* -------------------------------------------------------------------------- */

describe('the teacher result list', () => {
  const teacherRow = (over: Record<string, unknown> = {}) => ({
    resultId: 'result-1',
    examId: 'exam-1',
    examName: 'First Term Examination 2026',
    examTypeName: 'First Term',
    sessionName: '2026-27',
    studentCode: 'STU-0001',
    studentName: 'Ali Raza',
    rollNumber: '1',
    sectionId: 'section-1',
    className: '1st Year',
    divisionName: 'Boys',
    programName: 'Pre-Medical',
    sectionName: 'A',
    subjectId: 'biology',
    subjectName: 'Biology',
    maxMarks: '100.00',
    obtainedMarks: '90.00',
    percentage: '90.00',
    grade: 'A+',
    markStatus: 'ENTERED',
    subjectOutcome: 'PASS',
    ...over,
  })

  const options = (over: Record<string, unknown> = {}) => ({
    exams: [{ id: 'exam-1', name: 'First Term Examination 2026' }],
    classes: [{ id: 'class-1', name: '1st Year' }],
    programs: [{ id: 'premed', name: 'Pre-Medical' }],
    sections: [{ id: 'section-1', name: 'A', label: '1st Year · Boys · Pre-Medical · A' }],
    subjects: [{ id: 'biology', name: 'Biology' }],
    ...over,
  })

  const props = (over: Record<string, unknown> = {}) => ({
    rows: [teacherRow()],
    options: options(),
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
    filters: { search: '', examId: '', classId: '', programId: '', sectionId: '', subjectId: '' },
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  it('says so when the teacher has no assigned sections at all', () => {
    render(
      <TeacherResults
        {...props({ rows: [], options: options({ sections: [] }), total: 0, totalPages: 1 })}
      />,
    )
    expect(
      screen.getByText('No published results available for your assigned subjects and sections'),
    ).toBeTruthy()
  })

  it('shows one row per student per subject they teach', () => {
    render(<TeacherResults {...props()} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Ali Raza')).toBeTruthy()
    expect(within(table).getByText('Biology')).toBeTruthy()
    expect(within(table).getByText('90.00%')).toBeTruthy()
    expect(within(table).getByText('A+')).toBeTruthy()
  })

  it('shows no overall result — that is not the teacher’s business', () => {
    const { container } = render(<TeacherResults {...props()} />)
    const table = screen.getByRole('table')
    // Column headings a whole-student view would carry.
    for (const heading of ['Position', 'Result', 'Total']) {
      expect(within(table).queryByText(heading)).toBeNull()
    }
    expect(container.innerHTML).not.toMatch(/Incomplete|Pass rate/)
  })

  it('offers only the exams, subjects and sections the teacher is assigned to', () => {
    render(<TeacherResults {...props()} />)
    const subjectFilter = screen.getByLabelText('Subject') as HTMLSelectElement
    const values = [...subjectFilter.options].map((o) => o.textContent)
    expect(values).toEqual(['All my subjects', 'Biology'])

    const sectionFilter = screen.getByLabelText('Section') as HTMLSelectElement
    expect([...sectionFilter.options].map((o) => o.textContent)).toEqual([
      'All my sections',
      '1st Year · Boys · Pre-Medical · A',
    ])
  })

  it('says so when a filter matches nothing', () => {
    render(
      <TeacherResults
        {...props({
          rows: [],
          total: 0,
          filters: {
            search: 'nobody',
            examId: '',
            classId: '',
            programId: '',
            sectionId: '',
            subjectId: '',
          },
        })}
      />,
    )
    expect(screen.getByText('No results match these filters')).toBeTruthy()
  })

  it('shows an absence as an absence', () => {
    render(
      <TeacherResults
        {...props({
          rows: [
            teacherRow({
              markStatus: 'ABSENT',
              obtainedMarks: '0.00',
              percentage: '0.00',
              grade: 'F',
              subjectOutcome: 'FAIL',
            }),
          ],
        })}
      />,
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('Absent')).toBeTruthy()
    expect(within(table).getByText('0')).toBeTruthy()
  })

  it('offers nothing that would change anything', () => {
    render(<TeacherResults {...props()} />)
    expectNoMutationControls()
  })
})

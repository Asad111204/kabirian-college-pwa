/**
 * How a result is worked out, as pure functions.
 *
 * Nothing here reads the database, the request or the clock. Every input is
 * handed in and every output is returned — which means the rules the college
 * confirmed can be read in one place, and tested exhaustively without a
 * database. The service does the lookups and calls these; the routes call the
 * service.
 *
 * The rules, as the college confirmed them:
 *
 *   - a subject is passed at 50% of that paper's marks (each paper carries its
 *     own passing percentage, which defaults to 50),
 *   - a student passes overall only by passing EVERY subject *and* reaching 50%
 *     of the total,
 *   - absence scores zero, but stays recorded as absence rather than as a mark,
 *   - a student whose marks are not all in is INCOMPLETE, and is not ranked,
 *   - positions run by total marks, passing students first, and a tie shares a
 *     position and consumes the next one (450, 450, 440 gives 1st, 1st, 3rd).
 *
 * There are no optional subjects, no practicals and no grace marks.
 */
import { type DecimalInput, fromHundredths, percentageHundredths, reachesPercentage, toHundredths } from './exact'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** Mirrors the `MarkStatus` enum. PENDING means nobody has entered a mark yet. */
export type MarkStatusInput = 'PENDING' | 'ENTERED' | 'ABSENT'

/** A subject is passed, failed, or still waiting for its mark. */
export type SubjectOutcome = 'PASS' | 'FAIL' | 'PENDING'

/** Mirrors the `ResultOutcome` enum. */
export type OverallOutcome = 'PASS' | 'FAIL' | 'INCOMPLETE'

/**
 * One band of a grading scale. Only the lower bound is used to decide a grade —
 * see {@link findGrade} — so the upper bound is not needed here.
 */
export interface GradeBandInput {
  grade: string
  minPercentage: DecimalInput
}

/** One paper a student sat, together with the mark recorded for it. */
export interface SubjectMarkInput {
  examPaperId: string
  subjectId: string
  subjectName: string
  maxMarks: DecimalInput
  passingPercentage: DecimalInput
  status: MarkStatusInput
  obtainedMarks: DecimalInput | null
}

/** One row of the stored `subjectBreakdown`. Decimals are strings, kept exact. */
export interface SubjectBreakdownEntry {
  examPaperId: string
  subjectId: string
  subjectName: string
  maxMarks: string
  obtainedMarks: string | null
  status: MarkStatusInput
  percentage: string | null
  grade: string | null
  outcome: SubjectOutcome
}

/** Everything a `Result` row needs, except the snapshots the service adds. */
export interface CalculatedResult {
  subjects: SubjectBreakdownEntry[]
  totalMaxMarks: string
  totalObtainedMarks: string
  percentage: string
  grade: string | null
  outcome: OverallOutcome
  failedSubjectCount: number
  pendingSubjectCount: number
}

/**
 * The share of the total a student must reach to pass overall, on top of passing
 * every subject. Confirmed by the college as 50%.
 *
 * It is a parameter of {@link calculateResult} rather than a hidden constant, so
 * that if the college ever makes it a setting the calculation does not change.
 */
export const OVERALL_PASSING_PERCENTAGE = '50.00'

/* -------------------------------------------------------------------------- */
/* Grades                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The grade for a mark, chosen by the highest band the mark reaches.
 *
 * Bands are matched on their lower bound only. The college's scale reads
 * "A+ 90-100, A 80-89", and taking that literally would leave 89.5 with no
 * grade at all; matching on the lower bound means every percentage lands in
 * exactly one band and the seeded upper bounds are there for display.
 *
 * The comparison is exact rather than made against the rounded percentage, for
 * the same reason a pass is: a student on 89.999% has not reached 90, so they
 * get an A. Returns null when no band covers the mark, which means the scale
 * itself is incomplete.
 */
export function findGrade(
  bands: readonly GradeBandInput[],
  obtainedHundredths: number,
  maxHundredths: number,
): string | null {
  let best: { grade: string; min: number } | null = null
  for (const band of bands) {
    const min = toHundredths(band.minPercentage)
    if (!reachesPercentage(obtainedHundredths, maxHundredths, min)) continue
    if (!best || min > best.min) best = { grade: band.grade, min }
  }
  return best?.grade ?? null
}

/* -------------------------------------------------------------------------- */
/* One subject                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Works out one subject's percentage, grade and pass or fail.
 *
 * An absent student scores zero and fails, but the entry keeps `status:
 * 'ABSENT'`, so a reader can always tell "was not there" from "sat the paper
 * and scored nothing". A subject with no mark yet reports PENDING and is given
 * neither a percentage nor a grade — a missing mark is not a zero.
 */
export function calculateSubject(
  subject: SubjectMarkInput,
  bands: readonly GradeBandInput[],
): SubjectBreakdownEntry {
  const maxHundredths = toHundredths(subject.maxMarks)
  if (maxHundredths <= 0) {
    throw new RangeError(`Paper ${subject.examPaperId} has no maximum marks`)
  }

  const shared = {
    examPaperId: subject.examPaperId,
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    maxMarks: fromHundredths(maxHundredths),
    status: subject.status,
  }

  if (subject.status === 'PENDING') {
    if (subject.obtainedMarks !== null) {
      throw new RangeError(`Paper ${subject.examPaperId} is PENDING but carries a mark`)
    }
    return { ...shared, obtainedMarks: null, percentage: null, grade: null, outcome: 'PENDING' }
  }

  if (subject.obtainedMarks === null) {
    throw new RangeError(`Paper ${subject.examPaperId} is ${subject.status} but has no mark`)
  }

  const obtainedHundredths = toHundredths(subject.obtainedMarks)

  if (subject.status === 'ABSENT' && obtainedHundredths !== 0) {
    throw new RangeError(`Paper ${subject.examPaperId} is ABSENT but scores more than zero`)
  }
  if (obtainedHundredths > maxHundredths) {
    throw new RangeError(
      `Paper ${subject.examPaperId} has a mark above its maximum — refusing to guess what was meant`,
    )
  }

  const passingHundredths = toHundredths(subject.passingPercentage)
  const passed =
    subject.status !== 'ABSENT' &&
    reachesPercentage(obtainedHundredths, maxHundredths, passingHundredths)

  return {
    ...shared,
    obtainedMarks: fromHundredths(obtainedHundredths),
    percentage: fromHundredths(percentageHundredths(obtainedHundredths, maxHundredths)),
    grade: findGrade(bands, obtainedHundredths, maxHundredths),
    outcome: passed ? 'PASS' : 'FAIL',
  }
}

/* -------------------------------------------------------------------------- */
/* The whole result                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Works out a student's result for one exam.
 *
 * The total maximum counts every paper the student was due to sit, including
 * ones with no mark yet. That keeps an INCOMPLETE result honest: the percentage
 * shown is what they have scored out of the whole exam, not out of the part
 * that happens to have been marked, and it can only rise as the rest comes in.
 * INCOMPLETE results are never given a grade or a position.
 */
export function calculateResult(
  subjects: readonly SubjectMarkInput[],
  bands: readonly GradeBandInput[],
  options: { overallPassingPercentage?: DecimalInput } = {},
): CalculatedResult {
  if (subjects.length === 0) {
    throw new RangeError('Cannot calculate a result for a student with no papers')
  }

  const entries = subjects.map((subject) => calculateSubject(subject, bands))

  let totalMaxHundredths = 0
  let totalObtainedHundredths = 0
  let failedSubjectCount = 0
  let pendingSubjectCount = 0

  for (const entry of entries) {
    totalMaxHundredths += toHundredths(entry.maxMarks)
    if (entry.outcome === 'PENDING') {
      pendingSubjectCount += 1
      continue
    }
    totalObtainedHundredths += toHundredths(entry.obtainedMarks ?? '0')
    if (entry.outcome === 'FAIL') failedSubjectCount += 1
  }

  const overallThreshold = toHundredths(options.overallPassingPercentage ?? OVERALL_PASSING_PERCENTAGE)
  const reachedOverall = reachesPercentage(totalObtainedHundredths, totalMaxHundredths, overallThreshold)

  const outcome: OverallOutcome =
    pendingSubjectCount > 0 ? 'INCOMPLETE' : failedSubjectCount === 0 && reachedOverall ? 'PASS' : 'FAIL'

  return {
    subjects: entries,
    totalMaxMarks: fromHundredths(totalMaxHundredths),
    totalObtainedMarks: fromHundredths(totalObtainedHundredths),
    percentage: fromHundredths(percentageHundredths(totalObtainedHundredths, totalMaxHundredths)),
    grade: outcome === 'INCOMPLETE' ? null : findGrade(bands, totalObtainedHundredths, totalMaxHundredths),
    outcome,
    failedSubjectCount,
    pendingSubjectCount,
  }
}

/* -------------------------------------------------------------------------- */
/* Positions                                                                  */
/* -------------------------------------------------------------------------- */

/** The least a result needs for {@link assignPositions} to rank it. */
export interface RankableResult {
  studentId: string
  outcome: OverallOutcome
  totalObtainedMarks: DecimalInput
}

/**
 * Gives each student their position, keyed by student id.
 *
 * Passing students come before failing ones whatever the marks, then highest
 * total first. Equal totals share a position and consume the ones behind them,
 * so 450, 450 and 440 come out as 1st, 1st and 3rd rather than 1st, 1st and 2nd.
 *
 * An INCOMPLETE result gets null: ranking a student whose marks are not all in
 * would put them below classmates for work they have not been marked on yet.
 *
 * The caller decides *who* is compared — the section, the group or the class —
 * by passing only those results.
 */
export function assignPositions(results: readonly RankableResult[]): Map<string, number | null> {
  const positions = new Map<string, number | null>()

  const ranked = results
    .filter((result) => result.outcome !== 'INCOMPLETE')
    .map((result) => ({
      studentId: result.studentId,
      // Passing students rank ahead of failing ones regardless of marks.
      group: result.outcome === 'PASS' ? 0 : 1,
      total: toHundredths(result.totalObtainedMarks),
    }))
    .sort((a, b) => a.group - b.group || b.total - a.total)

  for (const result of results) {
    if (result.outcome === 'INCOMPLETE') positions.set(result.studentId, null)
  }

  let position = 0
  let previous: { group: number; total: number } | null = null
  ranked.forEach((result, index) => {
    if (!previous || previous.group !== result.group || previous.total !== result.total) {
      position = index + 1
    }
    positions.set(result.studentId, position)
    previous = result
  })

  return positions
}

/* -------------------------------------------------------------------------- */
/* Ranking scope                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Who a student is ranked against, from the `results.ranking_scope` setting.
 *
 * Every scope keeps **programmes apart**. A Pre-Medical student and a
 * Pre-Engineering student sit different papers out of different totals, so a
 * position that mixed them would compare two unrelated things. What the scopes
 * widen is division and section, never the course.
 */
export type RankingScope = 'SECTION' | 'GROUP' | 'CLASS'

export const RANKING_SCOPES: readonly RankingScope[] = ['SECTION', 'GROUP', 'CLASS']

export const RANKING_SCOPE_LABEL: Record<RankingScope, string> = {
  SECTION: 'Within the section',
  GROUP: 'Within the class, division and programme',
  CLASS: 'Within the class and programme',
}

/** Where a student sits, as far as ranking is concerned. */
export interface RankablePlacement {
  sectionId: string
  /** The class + division + programme group the section belongs to. */
  academicGroupId: string
  classId: string
  programId: string
}

/** The key that decides which students are compared with each other. */
export function rankingGroupKey(scope: RankingScope, placement: RankablePlacement): string {
  switch (scope) {
    case 'SECTION':
      return `section:${placement.sectionId}`
    case 'CLASS':
      // Across divisions and sections, but still one programme at a time.
      return `class:${placement.classId}:${placement.programId}`
    case 'GROUP':
    default:
      return `group:${placement.academicGroupId}`
  }
}

/**
 * Positions for a whole exam, one ranking per scope group.
 *
 * The caller hands in every result; this splits them by scope and ranks each
 * set on its own, so nobody is ever compared with a student sitting different
 * papers.
 */
export function assignPositionsByScope(
  results: readonly (RankableResult & RankablePlacement)[],
  scope: RankingScope,
): Map<string, number | null> {
  const groups = new Map<string, (RankableResult & RankablePlacement)[]>()
  for (const result of results) {
    const key = rankingGroupKey(scope, result)
    const list = groups.get(key) ?? []
    list.push(result)
    groups.set(key, list)
  }

  const positions = new Map<string, number | null>()
  for (const group of groups.values()) {
    for (const [studentId, position] of assignPositions(group)) {
      positions.set(studentId, position)
    }
  }
  return positions
}

/* -------------------------------------------------------------------------- */
/* What a result may show                                                     */
/* -------------------------------------------------------------------------- */

/** The three figures that only mean something once every paper is marked. */
export interface ResultFigures {
  percentage: string | null
  grade: string | null
  position: number | null
}

/**
 * Blanks the figures an INCOMPLETE result must not show.
 *
 * A student whose papers are not all marked has a percentage — of the whole
 * exam — but printing it would say something untrue: it reads as a score when
 * it is really a partial total. The same goes for the grade that follows from
 * it and for any position. They are suppressed here, in one place, so no screen
 * or API can show them by forgetting to check.
 *
 * The underlying figure is still *stored*: it is real data, and the only
 * sensible value to keep in a NOT NULL column. This decides what is reported.
 */
export function reportableFigures(
  outcome: OverallOutcome,
  figures: ResultFigures,
): ResultFigures {
  if (outcome !== 'INCOMPLETE') return figures
  return { percentage: null, grade: null, position: null }
}

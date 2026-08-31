/**
 * Generating, reviewing and publishing results.
 *
 * The arithmetic is not here. `exams/grading.ts` decides every figure — subject
 * percentages, grades, pass or fail, the overall outcome and the positions —
 * with no database access at all (ADR-106). This file does the lookups, runs
 * those pure functions over the answers, and writes the rows in one transaction.
 *
 * Two things it will not do:
 *
 *   - **generate a partial official result.** Every paper and section the exam
 *     covers must have a SUBMITTED mark sheet first, and the refusal names each
 *     one that is missing.
 *   - **overwrite a result somebody may have seen.** Regeneration supersedes:
 *     the old version stays readable and stops being current (ADR-107).
 *
 * Eligibility comes from the database — a student's ACTIVE enrolment, their
 * section's class and programme, and which papers cover it. No student id from
 * a request ever decides whose result is written or read.
 */
import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { readSetting } from '../settings/settings-store'
import {
  assignPositionsByScope,
  calculateResult,
  RANKING_SCOPES,
  reportableFigures,
  type GradeBandInput,
  type OverallOutcome,
  type MarkStatusInput,
  type RankingScope,
  type SubjectBreakdownEntry,
  type SubjectMarkInput,
  type SubjectOutcome,
} from '../exams/grading'
import {
  assertAdminArea,
  paginate,
  paginatedResult,
  type PaginatedResult,
} from './service-utils'
import type { ExamStatusValue } from '@/validation/exams'
import type {
  GenerateResultsInput,
  ResultListQuery,
  ResultOutcomeValue,
  ResultStatusValue,
  TeacherResultQuery,
} from '@/validation/results'

/* ========================================================================== */
/* Shapes                                                                     */
/* ========================================================================== */

/** One paper × section that must be marked before results can be generated. */
export interface RequiredMarkSheet {
  examPaperId: string
  subjectName: string
  className: string
  programName: string | null
  sectionId: string
  sectionName: string
  divisionName: string
  status: 'MISSING' | 'DRAFT' | 'SUBMITTED' | 'PUBLISHED'
}

export interface GenerationPreview {
  examId: string
  examName: string
  academicSessionId: string
  examTypeName: string
  sessionName: string
  examStatus: ExamStatusValue
  paperCount: number
  sectionCount: number
  studentCount: number
  submittedSheets: number
  pendingSheets: number
  /** Everything standing in the way, named. Empty means generation may run. */
  blockers: RequiredMarkSheet[]
  rankingScope: RankingScope
  gradeScaleName: string | null
  /** What already exists, so the screen can offer the right action. */
  existing: {
    total: number
    published: number
    generatedAt: string | null
    latestVersion: number
  } | null
}

export interface ResultRow {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  rollNumber: string | null
  /** Snapshotted with the result, so a student's list can name each exam. */
  examName: string
  examTypeName: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  totalMaxMarks: string
  totalObtainedMarks: string
  /** Null for an INCOMPLETE result — see the note on `toResultRow`. */
  percentage: string | null
  grade: string | null
  outcome: ResultOutcomeValue
  position: number | null
  positionScope: string | null
  status: ResultStatusValue
  version: number
  publishedAt: string | null
}

export interface ResultDetail extends ResultRow {
  examId: string
  fatherName: string | null
  gradeScaleName: string | null
  subjects: SubjectBreakdownEntry[]
  generatedAt: string
  correctionReason: string | null
}

export interface ResultSummary {
  total: number
  passed: number
  failed: number
  incomplete: number
  published: number
  /** Null when there is nothing to take a percentage of. */
  passPercentage: string | null
}

/* ========================================================================== */
/* Reading a stored result                                                    */
/* ========================================================================== */

type StoredResult = {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  rollNumber: string | null
  examName: string
  examTypeName: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  totalMaxMarks: Prisma.Decimal
  totalObtainedMarks: Prisma.Decimal
  percentage: Prisma.Decimal | null
  grade: string | null
  outcome: string
  position: number | null
  positionScope: string | null
  status: string
  version: number
  publishedAt: Date | null
}

/**
 * Turns a stored row into what a screen may show.
 *
 * **An INCOMPLETE result reports no percentage.** The column is NOT NULL, so
 * the figure the student has scored so far is stored — it is real data, and the
 * only sensible value to keep — but showing it would be misleading, because it
 * is a share of papers that have not all been marked. Every read goes through
 * here, so no caller can accidentally publish that number.
 */
function toResultRow(row: StoredResult): ResultRow {
  const outcome = row.outcome as ResultOutcomeValue
  // `.toFixed(2)` rather than `.toString()`: Prisma's Decimal drops trailing
  // zeros, which would report 90.00% as "90" and 82.50% as "82.5". These are
  // DECIMAL columns with two places and a result card reads them that way. It
  // is exact decimal arithmetic, not floating point.
  //
  // The column is null for an INCOMPLETE result, so the suppression below is
  // usually reading a null that is already there. It stays as a second line of
  // defence: it also blanks the grade and the position, and it keeps any row
  // written before the constraint existed reading correctly.
  const shown = reportableFigures(outcome, {
    percentage: row.percentage === null ? null : row.percentage.toFixed(2),
    grade: row.grade,
    position: row.position,
  })
  return {
    id: row.id,
    studentId: row.studentId,
    studentCode: row.studentCode,
    studentName: row.studentName,
    rollNumber: row.rollNumber,
    examName: row.examName,
    examTypeName: row.examTypeName,
    sessionName: row.sessionName,
    className: row.className,
    divisionName: row.divisionName,
    programName: row.programName,
    sectionName: row.sectionName,
    totalMaxMarks: row.totalMaxMarks.toFixed(2),
    totalObtainedMarks: row.totalObtainedMarks.toFixed(2),
    percentage: shown.percentage,
    grade: shown.grade,
    outcome,
    position: shown.position,
    positionScope: row.positionScope,
    status: row.status as ResultStatusValue,
    version: row.version,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }
}

/**
 * The same row, with its subject breakdown.
 *
 * Everything here is the stored snapshot: subject names, maximums and grades as
 * they were when the result was generated. Nothing is recalculated from the
 * live curriculum, the current grade bands or today's enrolment (ADR-108).
 */
function toResultDetail(row: StoredResult & {
  examId: string
  fatherName: string | null
  gradeScaleName: string | null
  subjectBreakdown: unknown
  generatedAt: Date
  correctionReason: string | null
}): ResultDetail {
  return {
    ...toResultRow(row),
    examId: row.examId,
    fatherName: row.fatherName,
    gradeScaleName: row.gradeScaleName,
    subjects: row.subjectBreakdown as SubjectBreakdownEntry[],
    generatedAt: row.generatedAt.toISOString(),
    correctionReason: row.correctionReason,
  }
}

/* ========================================================================== */
/* What the exam needs before results can be generated                        */
/* ========================================================================== */

/** The ranking scope the college has configured, defaulting to the group. */
async function rankingScope(): Promise<RankingScope> {
  const stored = await readSetting<string>('results.ranking_scope')
  return RANKING_SCOPES.includes(stored as RankingScope) ? (stored as RankingScope) : 'GROUP'
}

interface ExamShape {
  id: string
  name: string
  status: ExamStatusValue
  academicSessionId: string
  examTypeName: string
  sessionName: string
  papers: {
    id: string
    classId: string
    programId: string | null
    subjectId: string
    subjectName: string
    className: string
    programName: string | null
    maxMarks: string
    passingPercentage: string
  }[]
}

async function loadExam(examId: string): Promise<ExamShape> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      status: true,
      academicSessionId: true,
      examType: { select: { name: true } },
      academicSession: { select: { name: true } },
      papers: {
        where: { isActive: true },
        orderBy: [{ examDate: 'asc' }, { subject: { name: 'asc' } }],
        select: {
          id: true,
          classId: true,
          programId: true,
          subjectId: true,
          maxMarks: true,
          passingPercentage: true,
          subject: { select: { name: true } },
          class: { select: { name: true, displayName: true } },
          program: { select: { name: true } },
        },
      },
    },
  })
  if (!exam) throw new NotFoundError('exam')

  return {
    id: exam.id,
    name: exam.name,
    status: exam.status as ExamStatusValue,
    academicSessionId: exam.academicSessionId,
    examTypeName: exam.examType.name,
    sessionName: exam.academicSession.name,
    papers: exam.papers.map((paper) => ({
      id: paper.id,
      classId: paper.classId,
      programId: paper.programId,
      subjectId: paper.subjectId,
      subjectName: paper.subject.name,
      className: paper.class.displayName ?? paper.class.name,
      programName: paper.program?.name ?? null,
      maxMarks: paper.maxMarks.toString(),
      passingPercentage: paper.passingPercentage.toString(),
    })),
  }
}

interface EligibleStudent {
  studentId: string
  studentCode: string
  studentName: string
  fatherName: string | null
  rollNumber: string | null
  sectionId: string
  sectionName: string
  academicGroupId: string
  classId: string
  className: string
  divisionName: string
  programId: string
  programName: string
}

/**
 * Who sits this exam.
 *
 * Derived entirely from ACTIVE enrolments in the exam's own session, narrowed to
 * the classes its papers cover. A student cannot be given a result for another
 * section, programme, session or exam, because nothing in the request names any
 * of those — they come from the enrolment row.
 */
async function loadEligibleStudents(exam: ExamShape): Promise<EligibleStudent[]> {
  const classIds = [...new Set(exam.papers.map((p) => p.classId))]
  if (classIds.length === 0) return []

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicSessionId: exam.academicSessionId,
      status: 'ACTIVE',
      student: { deletedAt: null },
      section: { academicGroup: { classId: { in: classIds } } },
    },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
    select: {
      rollNumber: true,
      student: {
        select: { id: true, studentCode: true, fullName: true, fatherName: true },
      },
      section: {
        select: {
          id: true,
          name: true,
          academicGroupId: true,
          academicGroup: {
            select: {
              classId: true,
              programId: true,
              class: { select: { name: true, displayName: true } },
              division: { select: { name: true } },
              program: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  return enrollments.map((row) => ({
    studentId: row.student.id,
    studentCode: row.student.studentCode,
    studentName: row.student.fullName,
    fatherName: row.student.fatherName,
    rollNumber: row.rollNumber,
    sectionId: row.section.id,
    sectionName: row.section.name,
    academicGroupId: row.section.academicGroupId,
    classId: row.section.academicGroup.classId,
    className: row.section.academicGroup.class.displayName ?? row.section.academicGroup.class.name,
    divisionName: row.section.academicGroup.division.name,
    programId: row.section.academicGroup.programId,
    programName: row.section.academicGroup.program.name,
  }))
}

/** The papers one student is due to sit. */
function papersFor(exam: ExamShape, student: EligibleStudent) {
  return exam.papers.filter(
    (paper) =>
      paper.classId === student.classId &&
      (paper.programId === null || paper.programId === student.programId),
  )
}

/**
 * Every paper × section the exam covers, and whether its marks are in.
 *
 * A section is required for a paper when at least one enrolled student sits it,
 * so an empty section never blocks generation.
 */
async function requiredMarkSheets(
  exam: ExamShape,
  students: EligibleStudent[],
): Promise<RequiredMarkSheet[]> {
  const required = new Map<string, RequiredMarkSheet>()

  for (const student of students) {
    for (const paper of papersFor(exam, student)) {
      const key = `${paper.id}:${student.sectionId}`
      if (required.has(key)) continue
      required.set(key, {
        examPaperId: paper.id,
        subjectName: paper.subjectName,
        className: paper.className,
        programName: paper.programName,
        sectionId: student.sectionId,
        sectionName: student.sectionName,
        divisionName: student.divisionName,
        status: 'MISSING',
      })
    }
  }

  if (required.size === 0) return []

  const sheets = await prisma.examMarkSheet.findMany({
    where: { examPaper: { examId: exam.id } },
    select: { examPaperId: true, sectionId: true, status: true },
  })

  for (const sheet of sheets) {
    const entry = required.get(`${sheet.examPaperId}:${sheet.sectionId}`)
    if (entry) entry.status = sheet.status as RequiredMarkSheet['status']
  }

  return [...required.values()]
}

async function loadGradeScale(): Promise<{
  id: string | null
  name: string | null
  bands: GradeBandInput[]
}> {
  const scale = await prisma.gradeScale.findFirst({
    where: { isDefault: true, isActive: true },
    select: {
      id: true,
      name: true,
      bands: { select: { grade: true, minPercentage: true }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!scale) return { id: null, name: null, bands: [] }
  return {
    id: scale.id,
    name: scale.name,
    bands: scale.bands.map((band) => ({
      grade: band.grade,
      minPercentage: band.minPercentage.toString(),
    })),
  }
}

/**
 * Everything the Generate Results screen needs to decide whether to offer the
 * button, and to explain itself when it does not.
 */
export async function getGenerationPreview(
  ctx: AuthContext,
  examId: string,
): Promise<GenerationPreview> {
  assertAdminArea(ctx, 'Result generation')
  authorize(ctx, 'results.view')

  const exam = await loadExam(examId)
  const [students, scale, scope] = await Promise.all([
    loadEligibleStudents(exam),
    loadGradeScale(),
    rankingScope(),
  ])
  const required = await requiredMarkSheets(exam, students)

  const existingRows = await prisma.result.findMany({
    where: { examId, isCurrent: true },
    select: { status: true, version: true, generatedAt: true },
  })

  const eligible = students.filter((student) => papersFor(exam, student).length > 0)

  return {
    examId: exam.id,
    examName: exam.name,
    academicSessionId: exam.academicSessionId,
    examTypeName: exam.examTypeName,
    sessionName: exam.sessionName,
    examStatus: exam.status,
    paperCount: exam.papers.length,
    sectionCount: new Set(required.map((r) => r.sectionId)).size,
    studentCount: eligible.length,
    submittedSheets: required.filter((r) => r.status !== 'MISSING' && r.status !== 'DRAFT').length,
    pendingSheets: required.filter((r) => r.status === 'MISSING' || r.status === 'DRAFT').length,
    blockers: required.filter((r) => r.status === 'MISSING' || r.status === 'DRAFT'),
    rankingScope: scope,
    gradeScaleName: scale.name,
    existing:
      existingRows.length === 0
        ? null
        : {
            total: existingRows.length,
            published: existingRows.filter((r) => r.status === 'PUBLISHED').length,
            generatedAt:
              existingRows
                .map((r) => r.generatedAt)
                .sort((a, b) => b.getTime() - a.getTime())[0]
                ?.toISOString() ?? null,
            latestVersion: Math.max(...existingRows.map((r) => r.version)),
          },
  }
}

/* ========================================================================== */
/* Generating                                                                 */
/* ========================================================================== */

/**
 * Works out and stores every student's result for one exam.
 *
 * All of it or none of it: the calculation runs first, entirely in memory, and
 * the writes happen in a single transaction. A half-generated exam — some
 * students with a result and some without — would be indistinguishable from a
 * finished one.
 */
export async function generateResults(
  ctx: AuthContext,
  examId: string,
  input: GenerateResultsInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ generated: number; version: number; superseded: number }> {
  assertAdminArea(ctx, 'Result generation')
  authorize(ctx, 'results.generate')

  const exam = await loadExam(examId)

  if (exam.status === 'CANCELLED') {
    throw new ConflictError('This exam was cancelled, so it has no results to generate.')
  }
  if (exam.papers.length === 0) {
    throw new ValidationError('This exam has no papers, so there is nothing to calculate.')
  }

  const [students, scale, scope] = await Promise.all([
    loadEligibleStudents(exam),
    loadGradeScale(),
    rankingScope(),
  ])

  if (scale.bands.length === 0) {
    throw new ValidationError(
      'No default grading scale is configured, so results cannot be graded. Set one up first.',
    )
  }

  const eligible = students.filter((student) => papersFor(exam, student).length > 0)
  if (eligible.length === 0) {
    throw new ValidationError(
      'No enrolled student sits any paper in this exam, so there is nothing to calculate.',
    )
  }

  const required = await requiredMarkSheets(exam, students)
  const blockers = required.filter((r) => r.status === 'MISSING' || r.status === 'DRAFT')
  if (blockers.length > 0) {
    throw new ValidationError('Some mark sheets have not been submitted yet.', {
      markSheets: blockers.map(
        (b) =>
          `${b.subjectName} · ${b.className} ${b.divisionName} ${b.sectionName} — ${
            b.status === 'MISSING' ? 'not started' : 'still a draft'
          }`,
      ),
    })
  }

  const existing = await prisma.result.findMany({
    where: { examId, isCurrent: true },
    select: {
      id: true,
      studentId: true,
      studentCode: true,
      version: true,
      status: true,
      outcome: true,
      totalObtainedMarks: true,
      percentage: true,
      grade: true,
    },
  })

  if (existing.length > 0 && !input.regenerate) {
    throw new ConflictError(
      'Results have already been generated for this exam. Regenerate them explicitly if a correction is needed — the existing versions are kept.',
    )
  }

  // One query for every mark in the exam, rather than one per student.
  const marks = await prisma.mark.findMany({
    where: { examPaper: { examId }, markSheet: { status: { not: 'DRAFT' } } },
    select: { studentId: true, examPaperId: true, status: true, obtainedMarks: true },
  })
  const markByStudentPaper = new Map(
    marks.map((mark) => [`${mark.studentId}:${mark.examPaperId}`, mark]),
  )

  /* ---- the pure part: no database access below until the transaction ---- */

  const calculated = eligible.map((student) => {
    const subjects: SubjectMarkInput[] = papersFor(exam, student).map((paper) => {
      const mark = markByStudentPaper.get(`${student.studentId}:${paper.id}`)
      const status = (mark?.status as SubjectMarkInput['status']) ?? 'PENDING'
      return {
        examPaperId: paper.id,
        subjectId: paper.subjectId,
        subjectName: paper.subjectName,
        maxMarks: paper.maxMarks,
        passingPercentage: paper.passingPercentage,
        status,
        // A student with no mark row at all joined after the sheet went in.
        obtainedMarks: status === 'PENDING' ? null : (mark?.obtainedMarks?.toString() ?? null),
      }
    })

    return { student, result: calculateResult(subjects, scale.bands) }
  })

  const positions = assignPositionsByScope(
    calculated.map(({ student, result }) => ({
      studentId: student.studentId,
      outcome: result.outcome as OverallOutcome,
      totalObtainedMarks: result.totalObtainedMarks,
      sectionId: student.sectionId,
      academicGroupId: student.academicGroupId,
      classId: student.classId,
      programId: student.programId,
    })),
    scope,
  )

  const nextVersion =
    existing.length === 0 ? 1 : Math.max(...existing.map((row) => row.version)) + 1

  /**
   * On a correction, which students' results actually moved.
   *
   * A regeneration recalculates everybody, but usually only a handful change —
   * and those are what an audit reader needs. Student **codes** only, with the
   * outcome and the figures: no names, and nothing from a student's file.
   */
  const previousByStudent = new Map(existing.map((row) => [row.studentId, row]))
  const changes =
    existing.length === 0
      ? []
      : calculated
          .map(({ student, result }) => {
            const before = previousByStudent.get(student.studentId)
            if (!before) {
              return {
                studentCode: student.studentCode,
                from: null,
                to: { outcome: result.outcome, total: result.totalObtainedMarks },
              }
            }
            const sameTotal = before.totalObtainedMarks.toFixed(2) === result.totalObtainedMarks
            if (before.outcome === result.outcome && sameTotal && before.grade === result.grade) {
              return null
            }
            return {
              studentCode: student.studentCode,
              from: {
                outcome: before.outcome,
                total: before.totalObtainedMarks.toFixed(2),
                grade: before.grade,
              },
              to: {
                outcome: result.outcome,
                total: result.totalObtainedMarks,
                grade: result.grade,
              },
            }
          })
          .filter((change): change is NonNullable<typeof change> => change !== null)

  /* ---- the write: one transaction, all or nothing ---- */

  await prisma.$transaction(async (tx) => {
    if (existing.length > 0) {
      // Supersede rather than overwrite: the old rows stay readable (ADR-107).
      await tx.result.updateMany({
        where: { examId, isCurrent: true },
        data: { isCurrent: false },
      })
    }

    await tx.result.createMany({
      data: calculated.map(({ student, result }) => {
        // The same rule at write time as at read time: an INCOMPLETE result is
        // stored without a percentage, a grade or a position, so the partial
        // figure never becomes the official one (ADR-129).
        const stored = reportableFigures(result.outcome, {
          percentage: result.percentage,
          grade: result.grade,
          position: positions.get(student.studentId) ?? null,
        })
        return {
        examId: exam.id,
        studentId: student.studentId,
        version: nextVersion,
        isCurrent: true,
        academicSessionId: exam.academicSessionId,
        sectionId: student.sectionId,
        academicGroupId: student.academicGroupId,
        studentCode: student.studentCode,
        studentName: student.studentName,
        fatherName: student.fatherName,
        rollNumber: student.rollNumber,
        examName: exam.name,
        examTypeName: exam.examTypeName,
        sessionName: exam.sessionName,
        className: student.className,
        divisionName: student.divisionName,
        programName: student.programName,
        sectionName: student.sectionName,
        totalMaxMarks: result.totalMaxMarks,
        totalObtainedMarks: result.totalObtainedMarks,
        percentage: stored.percentage,
        grade: stored.grade,
        outcome: result.outcome,
        subjectBreakdown: result.subjects as unknown as Prisma.InputJsonValue,
        position: stored.position,
        positionScope: scope,
        gradeScaleId: scale.id,
        gradeScaleName: scale.name,
          status: 'DRAFT' as const,
          generatedByUserId: ctx.userId,
          correctionReason: existing.length > 0 ? (input.reason ?? null) : null,
        }
      }),
    })

    await writeAuditLog(
      ctx,
      {
        action: existing.length > 0 ? 'result.corrected' : 'result.generated',
        entityType: 'Exam',
        entityId: exam.id,
        entityLabel: exam.name,
        before:
          existing.length > 0
            ? { version: Math.max(...existing.map((r) => r.version)), count: existing.length }
            : undefined,
        after: {
          version: nextVersion,
          count: calculated.length,
          passed: calculated.filter((c) => c.result.outcome === 'PASS').length,
          failed: calculated.filter((c) => c.result.outcome === 'FAIL').length,
          incomplete: calculated.filter((c) => c.result.outcome === 'INCOMPLETE').length,
          rankingScope: scope,
          ...(existing.length > 0
            ? {
                changedCount: changes.length,
                // Capped so one regeneration cannot write a megabyte of JSON.
                changes: changes.slice(0, 200),
              }
            : {}),
        },
        metadata: existing.length > 0 ? { reason: input.reason ?? null } : undefined,
        request,
      },
      tx,
    )
  })

  return { generated: calculated.length, version: nextVersion, superseded: existing.length }
}

/* ========================================================================== */
/* Reviewing                                                                  */
/* ========================================================================== */

/**
 * The filter for one page of results.
 *
 * `academicGroupId` and `sectionId` on a result are **snapshots** — plain ids
 * with no foreign key, so that renaming or deleting a section can never rewrite
 * a published result (ADR-108). That means a class or programme filter cannot
 * be a join; the matching group ids are resolved first, in one cheap query, and
 * the result set is narrowed by those.
 */
async function buildWhere(
  examId: string,
  query: ResultListQuery,
): Promise<Prisma.ResultWhereInput> {
  let academicGroupIds: string[] | null = null

  if (query.classId || query.programId) {
    const groups = await prisma.academicGroup.findMany({
      where: {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.programId ? { programId: query.programId } : {}),
      },
      select: { id: true },
    })
    academicGroupIds = groups.map((group) => group.id)
  }

  return {
    examId,
    isCurrent: true,
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(academicGroupIds ? { academicGroupId: { in: academicGroupIds } } : {}),
    ...(query.search
      ? {
          OR: [
            { studentName: { contains: query.search, mode: 'insensitive' as const } },
            { studentCode: { contains: query.search, mode: 'insensitive' as const } },
            { rollNumber: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

export async function listResults(
  ctx: AuthContext,
  examId: string,
  query: ResultListQuery,
): Promise<PaginatedResult<ResultRow>> {
  assertAdminArea(ctx, 'Result review')
  authorize(ctx, 'results.view')

  const where = await buildWhere(examId, query)

  const [rows, total] = await Promise.all([
    prisma.result.findMany({
      where,
      orderBy: [{ position: { sort: 'asc', nulls: 'last' } }, { studentName: 'asc' }],
      ...paginate(query.page, query.pageSize),
    }),
    prisma.result.count({ where }),
  ])

  return paginatedResult(rows.map(toResultRow), total, query.page, query.pageSize)
}

/**
 * The headline counts.
 *
 * Grouped in the database rather than by loading every row, so an exam with
 * thousands of students costs the same as one with thirty.
 */
export async function getResultSummary(
  ctx: AuthContext,
  examId: string,
): Promise<ResultSummary> {
  assertAdminArea(ctx, 'Result review')
  authorize(ctx, 'results.view')

  const [byOutcome, published] = await Promise.all([
    prisma.result.groupBy({
      by: ['outcome'],
      where: { examId, isCurrent: true },
      _count: { _all: true },
    }),
    prisma.result.count({ where: { examId, isCurrent: true, status: 'PUBLISHED' } }),
  ])

  const countOf = (outcome: ResultOutcomeValue) =>
    byOutcome.find((row) => row.outcome === outcome)?._count._all ?? 0

  const passed = countOf('PASS')
  const failed = countOf('FAIL')
  const incomplete = countOf('INCOMPLETE')
  const total = passed + failed + incomplete

  // A pass rate over the students who actually have a complete result. With
  // nobody to count, there is no percentage — not 0%.
  const judged = passed + failed
  const passPercentage =
    judged === 0 ? null : ((passed * 10000) / judged / 100).toFixed(2)

  return { total, passed, failed, incomplete, published, passPercentage }
}

/** One student's result, with the subject breakdown as it was calculated. */
export async function getResult(ctx: AuthContext, resultId: string): Promise<ResultDetail> {
  assertAdminArea(ctx, 'Result review')
  authorize(ctx, 'results.view')

  const row = await prisma.result.findUnique({ where: { id: resultId } })
  if (!row) throw new NotFoundError('result')

  return toResultDetail(row)
}

/* ========================================================================== */
/* Publishing                                                                 */
/* ========================================================================== */

/**
 * Makes an exam's current results visible, or takes them back.
 *
 * Publishing is per exam rather than per student: a class where half the
 * results are out and half are not is worse than none of them being out.
 */
export async function setResultsPublished(
  ctx: AuthContext,
  examId: string,
  publish: boolean,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ affected: number }> {
  assertAdminArea(ctx, 'Result publication')
  authorize(ctx, 'results.publish')

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true },
  })
  if (!exam) throw new NotFoundError('exam')

  const current = await prisma.result.findMany({
    where: { examId, isCurrent: true },
    select: { id: true, status: true, outcome: true },
  })

  if (current.length === 0) {
    throw new ValidationError(
      'There are no generated results for this exam yet. Generate them first.',
    )
  }

  const target: ResultStatusValue = publish ? 'PUBLISHED' : 'DRAFT'
  const toChange = current.filter((row) => row.status !== target)

  if (toChange.length === 0) {
    throw new ConflictError(
      publish
        ? 'These results have already been published.'
        : 'These results have not been published.',
    )
  }

  const affected = await prisma.$transaction(async (tx) => {
    const updated = await tx.result.updateMany({
      where: { examId, isCurrent: true },
      data: publish
        ? { status: 'PUBLISHED', publishedAt: new Date(), publishedByUserId: ctx.userId }
        : { status: 'DRAFT', publishedAt: null, publishedByUserId: null },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'result.published',
        entityType: 'Exam',
        entityId: exam.id,
        entityLabel: exam.name,
        after: {
          published: publish,
          count: updated.count,
          passed: current.filter((r) => r.outcome === 'PASS').length,
          failed: current.filter((r) => r.outcome === 'FAIL').length,
          incomplete: current.filter((r) => r.outcome === 'INCOMPLETE').length,
        },
        request,
      },
      tx,
    )

    return updated.count
  })

  return { affected }
}

/* ========================================================================== */
/* What a student may see: their own published results, and nothing else      */
/* ========================================================================== */

/**
 * Refuses anyone who is not a student account with a student record, and
 * returns the student id **from the session**.
 *
 * There is deliberately no parameter for whose results these are, anywhere in
 * this file or in the route above it, so `?studentId=` has nothing to attach
 * itself to.
 */
function requireOwnStudentId(ctx: AuthContext): string {
  authorize(ctx, 'results.view')

  if (ctx.role !== 'STUDENT' || !ctx.studentId) {
    throw new ForbiddenError('This is only available to a student account.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
  return ctx.studentId
}

/**
 * The signed-in student's own published results, newest first.
 *
 * Only PUBLISHED, and only the current version of each — a result that has been
 * withdrawn, or superseded by a correction nobody has published yet, simply is
 * not here.
 */
export async function getMyPublishedResults(ctx: AuthContext): Promise<ResultRow[]> {
  const studentId = requireOwnStudentId(ctx)

  const rows = await prisma.result.findMany({
    where: { studentId, isCurrent: true, status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { generatedAt: 'desc' }],
  })
  return rows.map(toResultRow)
}

/**
 * One of the signed-in student's own results, with its subject breakdown.
 *
 * Ownership is checked against the session, and a result belonging to somebody
 * else is reported as **not found** rather than as forbidden — a 403 would
 * confirm the id exists, which is enough to tell one student that another has a
 * result for an exam (ADR-097).
 */
export async function getMyPublishedResult(
  ctx: AuthContext,
  resultId: string,
): Promise<ResultDetail> {
  const studentId = requireOwnStudentId(ctx)

  const row = await prisma.result.findUnique({ where: { id: resultId } })
  if (!row || row.studentId !== studentId || !row.isCurrent || row.status !== 'PUBLISHED') {
    throw new NotFoundError('result')
  }

  return toResultDetail(row)
}

/* ========================================================================== */
/* What a teacher may see: their own subjects, in their own sections          */
/* ========================================================================== */

/**
 * One row of a teacher's result list: one student, one subject.
 *
 * Deliberately **not** a whole result. A Biology teacher sees the Biology mark
 * of the students they teach — not their Chemistry mark, and not their overall
 * outcome, neither of which is any of their business. The whole-student view
 * belongs to the office and to the student themselves.
 */
export interface TeacherResultRow {
  resultId: string
  examId: string
  examName: string
  examTypeName: string
  sessionName: string
  studentCode: string
  studentName: string
  rollNumber: string | null
  sectionId: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  subjectId: string
  subjectName: string
  maxMarks: string
  obtainedMarks: string | null
  percentage: string | null
  grade: string | null
  /** The mark's own state: entered, absent, or not marked. */
  markStatus: MarkStatusInput
  /**
   * Whether this **subject** was passed — never the student's overall result,
   * which is not a teacher's business and is not returned here at all.
   */
  subjectOutcome: SubjectOutcome
}

export interface TeacherResultOptions {
  exams: { id: string; name: string }[]
  classes: { id: string; name: string }[]
  programs: { id: string; name: string }[]
  sections: { id: string; name: string; label: string }[]
  subjects: { id: string; name: string }[]
}

function requireOwnStaffId(ctx: AuthContext): string {
  authorize(ctx, 'results.view')

  if (ctx.role !== 'STAFF' || !ctx.staffId) {
    throw new ForbiddenError('The staff portal is only available to staff accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
  return ctx.staffId
}

/** The teacher's own ACTIVE assignments: which subjects, in which sections. */
async function loadTeachingScope(staffId: string) {
  const assignments = await prisma.teacherAssignment.findMany({
    where: { staffId, isActive: true },
    select: {
      sectionId: true,
      subjectId: true,
      subject: { select: { name: true } },
      section: {
        select: {
          name: true,
          academicGroup: {
            select: {
              classId: true,
              programId: true,
              class: { select: { name: true, displayName: true } },
              division: { select: { name: true } },
              program: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  /** sectionId -> the subject ids this teacher teaches there. */
  const subjectsBySection = new Map<string, Set<string>>()
  for (const assignment of assignments) {
    const set = subjectsBySection.get(assignment.sectionId) ?? new Set<string>()
    set.add(assignment.subjectId)
    subjectsBySection.set(assignment.sectionId, set)
  }

  return { assignments, subjectsBySection }
}

/**
 * The published results a teacher may see.
 *
 * Scope comes from their own ACTIVE `TeacherAssignment` records, resolved from
 * `ctx.staffId`. The caller's filters are applied **inside** that scope, so a
 * filter can only ever narrow what comes back — asking for a section they do
 * not teach returns nothing rather than somebody else's students (ADR-099).
 *
 * Paging is by student: one page of results comes from the database, and each
 * is expanded into the subjects this teacher teaches in that section. A teacher
 * usually teaches one subject per section, so a page is normally one row per
 * student.
 */
export async function getPublishedResultsForTeacher(
  ctx: AuthContext,
  query: TeacherResultQuery,
): Promise<PaginatedResult<TeacherResultRow>> {
  const staffId = requireOwnStaffId(ctx)
  const { subjectsBySection } = await loadTeachingScope(staffId)

  const scopedSectionIds = [...subjectsBySection.keys()]
  const empty = () => paginatedResult<TeacherResultRow>([], 0, query.page, query.pageSize)
  if (scopedSectionIds.length === 0) return empty()

  // A section filter narrows; it never widens. One outside the teaching scope
  // leaves the list empty rather than returning anybody else's students.
  const sectionIds = query.sectionId
    ? scopedSectionIds.includes(query.sectionId)
      ? [query.sectionId]
      : []
    : scopedSectionIds
  if (sectionIds.length === 0) return empty()

  let academicGroupIds: string[] | null = null
  if (query.classId || query.programId) {
    const groups = await prisma.academicGroup.findMany({
      where: {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.programId ? { programId: query.programId } : {}),
      },
      select: { id: true },
    })
    academicGroupIds = groups.map((group) => group.id)
  }

  const where: Prisma.ResultWhereInput = {
    isCurrent: true,
    status: 'PUBLISHED',
    sectionId: { in: sectionIds },
    ...(query.examId ? { examId: query.examId } : {}),
    ...(academicGroupIds ? { academicGroupId: { in: academicGroupIds } } : {}),
    ...(query.search
      ? {
          OR: [
            { studentName: { contains: query.search, mode: 'insensitive' as const } },
            { studentCode: { contains: query.search, mode: 'insensitive' as const } },
            { rollNumber: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.result.findMany({
      where,
      orderBy: [{ examName: 'desc' }, { sectionName: 'asc' }, { studentName: 'asc' }],
      ...paginate(query.page, query.pageSize),
    }),
    prisma.result.count({ where }),
  ])

  const items: TeacherResultRow[] = []
  for (const row of rows) {
    const teaches = subjectsBySection.get(row.sectionId)
    if (!teaches) continue

    const subjects = row.subjectBreakdown as unknown as SubjectBreakdownEntry[]
    for (const subject of subjects) {
      // The heart of the scope: only the subjects this teacher teaches, in the
      // section this student sat in.
      if (!teaches.has(subject.subjectId)) continue
      if (query.subjectId && subject.subjectId !== query.subjectId) continue

      items.push({
        resultId: row.id,
        examId: row.examId,
        examName: row.examName,
        examTypeName: row.examTypeName,
        sessionName: row.sessionName,
        studentCode: row.studentCode,
        studentName: row.studentName,
        rollNumber: row.rollNumber,
        sectionId: row.sectionId,
        className: row.className,
        divisionName: row.divisionName,
        programName: row.programName,
        sectionName: row.sectionName,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        maxMarks: subject.maxMarks,
        obtainedMarks: subject.obtainedMarks,
        percentage: subject.percentage,
        grade: subject.grade,
        markStatus: subject.status,
        subjectOutcome: subject.outcome,
      })
    }
  }

  return paginatedResult(items, total, query.page, query.pageSize)
}

/**
 * What the teacher's filter dropdowns may offer.
 *
 * Built from their own assignments and the exams that actually have published
 * results in those sections, so the screen never offers a choice that would
 * return nothing — or one they are not entitled to make.
 */
export async function getTeacherResultOptions(ctx: AuthContext): Promise<TeacherResultOptions> {
  const staffId = requireOwnStaffId(ctx)
  const { assignments, subjectsBySection } = await loadTeachingScope(staffId)

  const sectionIds = [...subjectsBySection.keys()]
  if (sectionIds.length === 0) {
    return { exams: [], classes: [], programs: [], sections: [], subjects: [] }
  }

  const exams = await prisma.result.findMany({
    where: { isCurrent: true, status: 'PUBLISHED', sectionId: { in: sectionIds } },
    select: { examId: true, examName: true },
    distinct: ['examId'],
    orderBy: { examName: 'desc' },
  })

  const classes = new Map<string, string>()
  const programs = new Map<string, string>()
  const sections = new Map<string, { id: string; name: string; label: string }>()
  const subjects = new Map<string, string>()

  for (const assignment of assignments) {
    const group = assignment.section.academicGroup
    const className = group.class.displayName ?? group.class.name
    classes.set(group.classId, className)
    programs.set(group.programId, group.program.name)
    sections.set(assignment.sectionId, {
      id: assignment.sectionId,
      name: assignment.section.name,
      label: `${className} · ${group.division.name} · ${group.program.name} · ${assignment.section.name}`,
    })
    subjects.set(assignment.subjectId, assignment.subject.name)
  }

  const toList = (map: Map<string, string>) =>
    [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))

  return {
    exams: exams.map((exam) => ({ id: exam.examId, name: exam.examName })),
    classes: toList(classes),
    programs: toList(programs),
    sections: [...sections.values()].sort((a, b) => a.label.localeCompare(b.label)),
    subjects: toList(subjects),
  }
}

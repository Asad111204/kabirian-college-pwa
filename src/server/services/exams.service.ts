/**
 * Exams, exam papers and the date sheet.
 *
 * This is the only place an exam may be created or changed. Every function
 * takes an AuthContext and checks permission first (ADR-008), and every id the
 * browser sends is re-checked against the database before it is used — a client
 * may name a class, a programme and a subject, but only the server decides
 * whether those three belong together.
 *
 * Two rules run through the whole file:
 *
 *   - **A published date sheet is not casually editable.** Once the schedule has
 *     gone out, papers and dates are frozen. Changing them needs an explicit,
 *     audited withdrawal first.
 *   - **A paper must be one a student could actually sit.** Its subject has to
 *     be in the curriculum for that class and programme, and it cannot clash
 *     with another paper the same student is already sitting.
 */
import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, NotFoundError, ValidationError } from '../api/errors'
import { collegeDateToStorage, storageToCollegeDate } from '../time/college-date'
import {
  assertAdminArea,
  assertNotReferenced,
  paginate,
  paginatedResult,
  withUniqueConstraintHandling,
  type PaginatedResult,
} from './service-utils'
import {
  checkPaperScope,
  findDateSheetProblems,
  findPaperConflict,
  isDateWithinExam,
  type ClassCurriculum,
} from '../exams/exam-policy'
import {
  isDateSheetPublished,
  isExamEditable,
  type ExamInput,
  type ExamListQuery,
  type ExamPaperInput,
  type ExamStatusValue,
  type ExamTypeInput,
} from '@/validation/exams'

/* ========================================================================== */
/* Exam types                                                                 */
/* ========================================================================== */

export interface ExamTypeRecord {
  id: string
  name: string
  code: string
  sortOrder: number
  isActive: boolean
  examCount: number
}

export async function listExamTypes(
  ctx: AuthContext,
  options: { includeInactive?: boolean } = {},
): Promise<ExamTypeRecord[]> {
  authorize(ctx, 'exams.view')

  const rows = await prisma.examType.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { exams: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    examCount: row._count.exams,
  }))
}

const EXAM_TYPE_CONFLICTS = {
  name: 'An exam type with this name already exists.',
  code: 'An exam type with this code already exists.',
}

export async function createExamType(ctx: AuthContext, input: ExamTypeInput) {
  assertAdminArea(ctx, 'Exam type management')
  authorize(ctx, 'exams.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.examType.create({ data: input }),
    EXAM_TYPE_CONFLICTS,
  )

  await writeAuditLog(ctx, {
    action: 'exam_type.created',
    entityType: 'exam_type',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateExamType(ctx: AuthContext, id: string, input: ExamTypeInput) {
  assertAdminArea(ctx, 'Exam type management')
  authorize(ctx, 'exams.manage')

  const before = await prisma.examType.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('exam type')

  const updated = await withUniqueConstraintHandling(
    () => prisma.examType.update({ where: { id }, data: input }),
    EXAM_TYPE_CONFLICTS,
  )

  await writeAuditLog(ctx, {
    action: 'exam_type.updated',
    entityType: 'exam_type',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setExamTypeActive(ctx: AuthContext, id: string, isActive: boolean) {
  assertAdminArea(ctx, 'Exam type management')
  authorize(ctx, 'exams.manage')

  const before = await prisma.examType.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('exam type')

  const updated = await prisma.examType.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'exam_type.activated' : 'exam_type.deactivated',
    entityType: 'exam_type',
    entityId: id,
    entityLabel: updated.name,
    before: { isActive: before.isActive },
    after: { isActive },
  })

  return updated
}

/**
 * Removes an exam type that has never been used.
 *
 * An exam type any exam refers to is never deleted — deactivating it hides it
 * from new exams while every past exam keeps the name it was held under.
 */
export async function deleteExamType(ctx: AuthContext, id: string) {
  assertAdminArea(ctx, 'Exam type management')
  authorize(ctx, 'exams.manage')

  const record = await prisma.examType.findUnique({
    where: { id },
    include: { _count: { select: { exams: true } } },
  })
  if (!record) throw new NotFoundError('exam type')

  assertNotReferenced(`The exam type "${record.name}"`, [
    { label: 'exam(s)', count: record._count.exams },
  ])

  await prisma.examType.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'exam_type.updated',
    entityType: 'exam_type',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

/* ========================================================================== */
/* Exams                                                                      */
/* ========================================================================== */

export interface ExamRow {
  id: string
  name: string
  examTypeId: string
  examTypeName: string
  academicSessionId: string
  sessionName: string
  startDate: string | null
  endDate: string | null
  status: ExamStatusValue
  description: string | null
  paperCount: number
  dateSheetPublished: boolean
}

function toExamRow(row: {
  id: string
  name: string
  examTypeId: string
  examType: { name: string }
  academicSessionId: string
  academicSession: { name: string }
  startDate: Date | null
  endDate: Date | null
  status: string
  description: string | null
  _count: { papers: number }
}): ExamRow {
  const status = row.status as ExamStatusValue
  return {
    id: row.id,
    name: row.name,
    examTypeId: row.examTypeId,
    examTypeName: row.examType.name,
    academicSessionId: row.academicSessionId,
    sessionName: row.academicSession.name,
    startDate: row.startDate ? storageToCollegeDate(row.startDate) : null,
    endDate: row.endDate ? storageToCollegeDate(row.endDate) : null,
    status,
    description: row.description,
    paperCount: row._count.papers,
    dateSheetPublished: isDateSheetPublished(status),
  }
}

export async function listExams(
  ctx: AuthContext,
  query: ExamListQuery,
): Promise<PaginatedResult<ExamRow>> {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.view')

  const where: Prisma.ExamWhereInput = {
    ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
    ...(query.examTypeId ? { examTypeId: query.examTypeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { examType: { name: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        examType: { select: { name: true } },
        academicSession: { select: { name: true } },
        _count: { select: { papers: true } },
      },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.exam.count({ where }),
  ])

  return paginatedResult(rows.map(toExamRow), total, query.page, query.pageSize)
}

export interface ExamPaperRow {
  id: string
  classId: string
  className: string
  classLevel: number
  subjectId: string
  subjectName: string
  subjectCode: string | null
  programId: string | null
  programName: string | null
  examDate: string | null
  startTime: string | null
  endTime: string | null
  room: string | null
  maxMarks: string
  passingPercentage: string
  markSheetCount: number
  markCount: number
}

export interface ExamDetail extends ExamRow {
  papers: ExamPaperRow[]
  /** True once any marking has begun, which blocks deletion outright. */
  hasMarkingActivity: boolean
}

/**
 * One exam with its papers.
 *
 * The papers come back in one query with their class, subject and programme
 * joined — the whole date sheet is a handful of rows, and fetching each paper's
 * subject separately would be the classic N+1.
 */
export async function getExam(ctx: AuthContext, id: string): Promise<ExamDetail> {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.view')

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      examType: { select: { name: true } },
      academicSession: { select: { name: true } },
      _count: { select: { papers: true, results: true } },
      papers: {
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }, { subject: { name: 'asc' } }],
        include: {
          class: { select: { name: true, displayName: true, level: true } },
          subject: { select: { name: true, code: true } },
          program: { select: { name: true } },
          _count: { select: { markSheets: true, marks: true } },
        },
      },
    },
  })
  if (!exam) throw new NotFoundError('exam')

  const papers: ExamPaperRow[] = exam.papers.map((paper) => ({
    id: paper.id,
    classId: paper.classId,
    className: paper.class.displayName ?? paper.class.name,
    classLevel: paper.class.level,
    subjectId: paper.subjectId,
    subjectName: paper.subject.name,
    subjectCode: paper.subject.code,
    programId: paper.programId,
    programName: paper.program?.name ?? null,
    examDate: paper.examDate ? storageToCollegeDate(paper.examDate) : null,
    startTime: paper.startTime,
    endTime: paper.endTime,
    room: paper.room,
    maxMarks: paper.maxMarks.toString(),
    passingPercentage: paper.passingPercentage.toString(),
    markSheetCount: paper._count.markSheets,
    markCount: paper._count.marks,
  }))

  return {
    ...toExamRow(exam),
    papers,
    hasMarkingActivity:
      exam._count.results > 0 || papers.some((p) => p.markSheetCount > 0 || p.markCount > 0),
  }
}

/** Loads an exam and refuses if its schedule is no longer open to change. */
async function loadEditableExam(id: string) {
  const exam = await prisma.exam.findUnique({ where: { id } })
  if (!exam) throw new NotFoundError('exam')

  const status = exam.status as ExamStatusValue
  if (!isExamEditable(status)) {
    throw new ConflictError(
      isDateSheetPublished(status)
        ? 'This date sheet has been published. Withdraw it first if the schedule really has to change — teachers and students may already have seen it.'
        : 'A cancelled exam cannot be edited. Return it to draft first.',
    )
  }
  return exam
}

export async function createExam(ctx: AuthContext, input: ExamInput) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const [session, examType] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: input.academicSessionId } }),
    prisma.examType.findUnique({ where: { id: input.examTypeId } }),
  ])
  if (!session) throw new NotFoundError('academic session')
  if (!examType) throw new NotFoundError('exam type')
  if (!examType.isActive) {
    throw new ValidationError('That exam type is no longer active.', {
      examTypeId: ['Choose an active exam type.'],
    })
  }

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.exam.create({
        data: {
          name: input.name,
          examTypeId: input.examTypeId,
          academicSessionId: input.academicSessionId,
          startDate: input.startDate ? collegeDateToStorage(input.startDate) : null,
          endDate: input.endDate ? collegeDateToStorage(input.endDate) : null,
          description: input.description ?? null,
          createdByUserId: ctx.userId,
        },
      }),
    { name: 'An exam with this name already exists in this session.' },
  )

  await writeAuditLog(ctx, {
    action: 'exam.created',
    entityType: 'exam',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateExam(ctx: AuthContext, id: string, input: ExamInput) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const before = await loadEditableExam(id)

  const examType = await prisma.examType.findUnique({ where: { id: input.examTypeId } })
  if (!examType) throw new NotFoundError('exam type')

  // Moving an exam to another session would strand every paper, because a paper
  // proves through a composite key that it belongs to its exam's session.
  if (input.academicSessionId !== before.academicSessionId) {
    const paperCount = await prisma.examPaper.count({ where: { examId: id } })
    if (paperCount > 0) {
      throw new ConflictError(
        'This exam already has papers, so it cannot be moved to a different academic session. Remove the papers first, or create a new exam in the other session.',
      )
    }
    const session = await prisma.academicSession.findUnique({
      where: { id: input.academicSessionId },
    })
    if (!session) throw new NotFoundError('academic session')
  }

  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.exam.update({
        where: { id },
        data: {
          name: input.name,
          examTypeId: input.examTypeId,
          academicSessionId: input.academicSessionId,
          startDate: input.startDate ? collegeDateToStorage(input.startDate) : null,
          endDate: input.endDate ? collegeDateToStorage(input.endDate) : null,
          description: input.description ?? null,
          updatedByUserId: ctx.userId,
        },
      }),
    { name: 'An exam with this name already exists in this session.' },
  )

  await writeAuditLog(ctx, {
    action: 'exam.updated',
    entityType: 'exam',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

/**
 * Cancels an exam, or returns a cancelled one to draft.
 *
 * Cancelling is the alternative to deleting: the record and its papers stay
 * readable, which matters once anyone has seen the schedule.
 */
export async function setExamStatus(
  ctx: AuthContext,
  id: string,
  status: 'DRAFT' | 'CANCELLED',
) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const before = await prisma.exam.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('exam')

  const current = before.status as ExamStatusValue
  if (current === status) return before

  if (status === 'CANCELLED' && (current === 'MARKS_ENTRY' || current === 'COMPLETED')) {
    throw new ConflictError(
      'Marks have already been entered against this exam, so it can no longer be cancelled.',
    )
  }
  if (status === 'DRAFT' && current !== 'CANCELLED') {
    throw new ConflictError('Only a cancelled exam can be returned to draft here.')
  }

  const updated = await prisma.exam.update({
    where: { id },
    data: { status, updatedByUserId: ctx.userId },
  })

  await writeAuditLog(ctx, {
    action: 'exam.status_changed',
    entityType: 'exam',
    entityId: id,
    entityLabel: updated.name,
    before: { status: current },
    after: { status },
  })

  return updated
}

/**
 * Deletes a draft exam that has never been used.
 *
 * Anything with a mark sheet, a mark or a result is examination history and is
 * never removed — the admin cancels it instead. A draft that nobody has marked
 * against is genuinely disposable, and its papers go with it in one transaction.
 */
export async function deleteExam(ctx: AuthContext, id: string) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { _count: { select: { papers: true, results: true } } },
  })
  if (!exam) throw new NotFoundError('exam')

  if ((exam.status as ExamStatusValue) !== 'DRAFT') {
    throw new ConflictError(
      'Only a draft exam can be deleted. Cancel this one instead — that keeps the record and its schedule readable.',
    )
  }

  const [markSheets, marks] = await Promise.all([
    prisma.examMarkSheet.count({ where: { examPaper: { examId: id } } }),
    prisma.mark.count({ where: { examPaper: { examId: id } } }),
  ])

  assertNotReferenced(`The exam "${exam.name}"`, [
    { label: 'mark sheet(s)', count: markSheets },
    { label: 'mark(s)', count: marks },
    { label: 'result(s)', count: exam._count.results },
  ])

  await prisma.$transaction(async (tx) => {
    await tx.examPaper.deleteMany({ where: { examId: id } })
    await tx.exam.delete({ where: { id } })
    await writeAuditLog(
      ctx,
      {
        action: 'exam.deleted',
        entityType: 'exam',
        entityId: id,
        entityLabel: exam.name,
        before: exam,
        metadata: { paperCount: exam._count.papers },
      },
      tx,
    )
  })
}

/* ========================================================================== */
/* What a paper may be made of                                                */
/* ========================================================================== */

export interface PaperOptionProgram {
  id: string
  name: string
  /** Subjects in this programme's curriculum for the class, in curriculum order. */
  subjects: { id: string; name: string; code: string | null }[]
}

export interface PaperOptionClass {
  id: string
  name: string
  level: number
  programs: PaperOptionProgram[]
  /**
   * Subjects every programme in the class studies — the only ones that may be
   * set as a single paper for the whole class (ADR-109).
   */
  sharedSubjects: { id: string; name: string; code: string | null }[]
}

/**
 * The classes, programmes and subjects an exam's papers may use.
 *
 * Everything comes from the session's own structure and curriculum, so a college
 * that adds "I.Com" tomorrow sees it here with no code change. A subject that is
 * not in a programme's curriculum is never offered, and the server refuses it
 * even if the browser asks for it anyway.
 */
export async function getPaperOptions(
  ctx: AuthContext,
  academicSessionId: string,
): Promise<PaperOptionClass[]> {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.view')

  const [groups, curriculum] = await Promise.all([
    prisma.academicGroup.findMany({
      where: { academicSessionId, isActive: true },
      include: {
        class: { select: { id: true, name: true, displayName: true, level: true } },
        program: { select: { id: true, name: true, sortOrder: true } },
      },
    }),
    prisma.curriculumSubject.findMany({
      where: { academicSessionId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: [{ sortOrder: 'asc' }, { subject: { name: 'asc' } }],
    }),
  ])

  // curriculum, keyed by "classId:programId"
  const byClassProgram = new Map<string, { id: string; name: string; code: string | null }[]>()
  for (const row of curriculum) {
    const key = `${row.classId}:${row.programId}`
    const list = byClassProgram.get(key) ?? []
    list.push({ id: row.subject.id, name: row.subject.name, code: row.subject.code })
    byClassProgram.set(key, list)
  }

  const classes = new Map<string, PaperOptionClass>()
  const seenProgram = new Set<string>()

  for (const group of groups.sort(
    (a, b) => a.class.level - b.class.level || a.program.sortOrder - b.program.sortOrder,
  )) {
    let entry = classes.get(group.classId)
    if (!entry) {
      entry = {
        id: group.classId,
        name: group.class.displayName ?? group.class.name,
        level: group.class.level,
        programs: [],
        sharedSubjects: [],
      }
      classes.set(group.classId, entry)
    }

    // A class + programme pair appears once per division; list it once.
    const pairKey = `${group.classId}:${group.programId}`
    if (seenProgram.has(pairKey)) continue
    seenProgram.add(pairKey)

    entry.programs.push({
      id: group.programId,
      name: group.program.name,
      subjects: byClassProgram.get(pairKey) ?? [],
    })
  }

  // A shared paper is only honest when every programme in the class studies the
  // subject — otherwise some of its students would be sitting a paper that is
  // not on their curriculum.
  for (const entry of classes.values()) {
    if (entry.programs.length === 0) continue
    const [first, ...rest] = entry.programs
    entry.sharedSubjects = (first?.subjects ?? []).filter((subject) =>
      rest.every((program) => program.subjects.some((s) => s.id === subject.id)),
    )
  }

  return [...classes.values()]
}

/* ========================================================================== */
/* Exam papers                                                                */
/* ========================================================================== */

/**
 * Loads what a class actually offers this session, so the pure rules can decide.
 */
async function loadClassCurriculum(
  academicSessionId: string,
  classId: string,
): Promise<ClassCurriculum | null> {
  const [groups, curriculum] = await Promise.all([
    prisma.academicGroup.findMany({
      where: { academicSessionId, classId, isActive: true },
      select: { programId: true },
      distinct: ['programId'],
    }),
    prisma.curriculumSubject.findMany({
      where: { academicSessionId, classId },
      select: { programId: true, subjectId: true },
    }),
  ])

  if (groups.length === 0) return null

  const subjectsByProgram: Record<string, string[]> = {}
  for (const row of curriculum) {
    ;(subjectsByProgram[row.programId] ??= []).push(row.subjectId)
  }

  return { programIds: groups.map((g) => g.programId), subjectsByProgram }
}

/**
 * Checks that a paper's class, programme and subject genuinely belong together
 * in this session, whatever the browser claimed. The decision itself is pure and
 * lives in exam-policy.ts; this only fetches what it needs.
 */
async function assertPaperScope(
  academicSessionId: string,
  input: { classId: string; programId?: string; subjectId: string },
): Promise<void> {
  const available = await loadClassCurriculum(academicSessionId, input.classId)
  const verdict = checkPaperScope(available, input)
  if (verdict.ok) return

  throw new ValidationError(verdict.message, { [verdict.field]: [verdict.message] })
}

/** Refuses a paper the same student could not possibly sit. */
async function assertNoPaperConflict(
  examId: string,
  input: {
    classId: string
    subjectId: string
    programId?: string
    examDate?: string
    startTime?: string
    endTime?: string
  },
  excludePaperId?: string,
): Promise<void> {
  const siblings = await prisma.examPaper.findMany({
    where: {
      examId,
      classId: input.classId,
      ...(excludePaperId ? { id: { not: excludePaperId } } : {}),
    },
    include: {
      class: { select: { name: true, displayName: true } },
      subject: { select: { name: true } },
      program: { select: { name: true } },
    },
  })

  const conflict = findPaperConflict(
    siblings.map((other) => ({
      id: other.id,
      classId: other.classId,
      className: other.class.displayName ?? other.class.name,
      programId: other.programId,
      programName: other.program?.name ?? null,
      subjectId: other.subjectId,
      subjectName: other.subject.name,
      examDate: other.examDate ? storageToCollegeDate(other.examDate) : null,
      startTime: other.startTime,
      endTime: other.endTime,
      room: other.room,
      maxMarks: other.maxMarks.toString(),
    })),
    input,
  )

  if (conflict) {
    throw new ConflictError(conflict.message, { [conflict.field]: [conflict.message] })
  }
}

/** Keeps a paper's date inside the exam's own dates, when the exam has any. */
function assertDateWithinExam(
  exam: { startDate: Date | null; endDate: Date | null },
  examDate?: string,
): void {
  const from = exam.startDate ? storageToCollegeDate(exam.startDate) : null
  const to = exam.endDate ? storageToCollegeDate(exam.endDate) : null
  if (isDateWithinExam({ startDate: from, endDate: to }, examDate)) return

  throw new ValidationError('That date falls outside the exam’s own dates.', {
    examDate: [
      `Choose a date${from ? ` on or after ${from}` : ''}${from && to ? ' and' : ''}${
        to ? ` on or before ${to}` : ''
      }.`,
    ],
  })
}

export async function createExamPaper(ctx: AuthContext, examId: string, input: ExamPaperInput) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const exam = await loadEditableExam(examId)

  await assertPaperScope(exam.academicSessionId, input)
  assertDateWithinExam(exam, input.examDate)
  await assertNoPaperConflict(examId, input)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.examPaper.create({
        data: {
          examId,
          academicSessionId: exam.academicSessionId,
          classId: input.classId,
          subjectId: input.subjectId,
          programId: input.programId ?? null,
          examDate: input.examDate ? collegeDateToStorage(input.examDate) : null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          room: input.room ?? null,
          maxMarks: input.maxMarks,
          passingPercentage: input.passingPercentage,
          createdByUserId: ctx.userId,
        },
        include: { subject: { select: { name: true } } },
      }),
    {},
    'This paper already exists for this exam.',
  )

  await writeAuditLog(ctx, {
    action: 'exam_paper.created',
    entityType: 'exam_paper',
    entityId: created.id,
    entityLabel: `${exam.name} · ${created.subject.name}`,
    after: { ...created, subject: undefined },
    metadata: { examId },
  })

  return created
}

export async function updateExamPaper(
  ctx: AuthContext,
  examId: string,
  paperId: string,
  input: ExamPaperInput,
) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const exam = await loadEditableExam(examId)

  const before = await prisma.examPaper.findUnique({ where: { id: paperId } })
  if (!before || before.examId !== examId) throw new NotFoundError('exam paper')

  await assertPaperScope(exam.academicSessionId, input)
  assertDateWithinExam(exam, input.examDate)
  await assertNoPaperConflict(examId, input, paperId)

  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.examPaper.update({
        where: { id: paperId },
        data: {
          classId: input.classId,
          subjectId: input.subjectId,
          programId: input.programId ?? null,
          examDate: input.examDate ? collegeDateToStorage(input.examDate) : null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          room: input.room ?? null,
          maxMarks: input.maxMarks,
          passingPercentage: input.passingPercentage,
          updatedByUserId: ctx.userId,
        },
        include: { subject: { select: { name: true } } },
      }),
    {},
    'This paper already exists for this exam.',
  )

  await writeAuditLog(ctx, {
    action: 'exam_paper.updated',
    entityType: 'exam_paper',
    entityId: paperId,
    entityLabel: `${exam.name} · ${updated.subject.name}`,
    before,
    after: { ...updated, subject: undefined },
    metadata: { examId },
  })

  return updated
}

export async function deleteExamPaper(ctx: AuthContext, examId: string, paperId: string) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const exam = await loadEditableExam(examId)

  const paper = await prisma.examPaper.findUnique({
    where: { id: paperId },
    include: {
      subject: { select: { name: true } },
      _count: { select: { markSheets: true, marks: true } },
    },
  })
  if (!paper || paper.examId !== examId) throw new NotFoundError('exam paper')

  assertNotReferenced(`The ${paper.subject.name} paper`, [
    { label: 'mark sheet(s)', count: paper._count.markSheets },
    { label: 'mark(s)', count: paper._count.marks },
  ])

  await prisma.examPaper.delete({ where: { id: paperId } })

  await writeAuditLog(ctx, {
    action: 'exam_paper.deleted',
    entityType: 'exam_paper',
    entityId: paperId,
    entityLabel: `${exam.name} · ${paper.subject.name}`,
    before: { ...paper, _count: undefined, subject: undefined },
    metadata: { examId },
  })
}

/**
 * Publishes the date sheet, or withdraws it again.
 *
 * Publishing is what moves the exam from DRAFT to SCHEDULED — the schema has no
 * separate flag, and "scheduled" is exactly what a published date sheet means.
 * Withdrawing is the explicit, audited action that reopens the schedule for
 * editing after people may already have seen it.
 */
export async function setDateSheetPublished(ctx: AuthContext, examId: string, publish: boolean) {
  assertAdminArea(ctx, 'Exam management')
  authorize(ctx, 'exams.manage')

  const detail = await getExam(ctx, examId)

  if (publish) {
    if (detail.status !== 'DRAFT') {
      throw new ConflictError(
        detail.status === 'CANCELLED'
          ? 'A cancelled exam has no schedule to publish.'
          : 'This date sheet has already been published.',
      )
    }

    const problems = findDateSheetProblems(detail.papers)
    if (problems.length > 0) {
      throw new ValidationError('The date sheet is not ready to publish.', {
        dateSheet: problems.map((p) => p.message),
      })
    }
  } else {
    if (!isDateSheetPublished(detail.status)) {
      throw new ConflictError('This date sheet has not been published.')
    }
    if (detail.status !== 'SCHEDULED') {
      throw new ConflictError(
        'Marks have already been entered against this exam, so its schedule can no longer be withdrawn.',
      )
    }
  }

  const updated = await prisma.exam.update({
    where: { id: examId },
    data: { status: publish ? 'SCHEDULED' : 'DRAFT', updatedByUserId: ctx.userId },
  })

  await writeAuditLog(ctx, {
    action: publish ? 'date_sheet.published' : 'date_sheet.withdrawn',
    entityType: 'exam',
    entityId: examId,
    entityLabel: updated.name,
    before: { status: detail.status },
    after: { status: updated.status },
    metadata: { paperCount: detail.papers.length },
  })

  return updated
}


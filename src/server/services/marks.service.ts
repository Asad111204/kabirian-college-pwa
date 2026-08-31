/**
 * Mark sheets: a teacher entering one paper's marks for one section.
 *
 * This is the only place a mark may be written. Every function takes an
 * AuthContext and checks permission first (ADR-008), and nothing the browser
 * sends is trusted as proof of anything:
 *
 *   - the **teacher** is `ctx.staffId`, resolved from the session cookie. There
 *     is no `staffId` parameter to forge.
 *   - the **subject** is the paper's, never a field in the request.
 *   - the **session** is the paper's, and the section must already belong to it
 *     — the composite foreign keys make any other combination unstorable.
 *   - the **roster** is rebuilt from ACTIVE enrollments on every read and every
 *     save, so a caller cannot add a student by sending an extra id, or remove
 *     one by leaving an id out.
 *
 * Authorisation reuses the Phase 5 `TeacherAssignment` records — the same ones
 * subject-wise attendance uses. There is no second teacher-subject system.
 */
import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, can, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { storageToCollegeDate } from '../time/college-date'
import { fromHundredths, toHundredths, tryHundredths } from '../exams/exact'
import {
  decideCanEditMarks,
  decideCanEnterMarks,
  decideCanSubmitMarks,
  findUnenteredStudents,
  type MarkingContext,
  type MarksViewer,
} from '../exams/marks-access'
import { assertAdminArea } from './service-utils'
import type { ExamStatusValue } from '@/validation/exams'
import type {
  MarkSheetStatusValue,
  MarkStatusValue,
  OpenMarkSheetInput,
  SaveMarksInput,
} from '@/validation/marks'

/* ========================================================================== */
/* Shapes                                                                     */
/* ========================================================================== */

export interface MarkSheetPaper {
  examId: string
  examName: string
  examTypeName: string
  examStatus: ExamStatusValue
  academicSessionId: string
  sessionName: string
  examPaperId: string
  subjectId: string
  subjectName: string
  classId: string
  className: string
  programId: string | null
  programName: string | null
  examDate: string | null
  startTime: string | null
  endTime: string | null
  maxMarks: string
  passingPercentage: string
}

export interface MarkRow {
  studentId: string
  studentCode: string
  fullName: string
  rollNumber: string | null
  status: MarkStatusValue
  obtainedMarks: string | null
  remarks: string | null
}

export interface MarkSheetCounts {
  total: number
  entered: number
  absent: number
  pending: number
}

export interface MarkSheetDetail extends MarkSheetPaper {
  id: string
  sectionId: string
  sectionName: string
  divisionName: string
  status: MarkSheetStatusValue
  enteredByStaffId: string
  enteredByName: string
  submittedAt: string | null
  updatedAt: string
  counts: MarkSheetCounts
  marks: MarkRow[]
  canEdit: boolean
  canSubmit: boolean
}

/** One row of the teacher's "what can I mark?" list. */
export interface MyPaperOption extends MarkSheetPaper {
  sectionId: string
  sectionName: string
  divisionName: string
  studentCount: number
  sheet: {
    id: string
    status: MarkSheetStatusValue
    submittedAt: string | null
    counts: MarkSheetCounts
  } | null
}

/* ========================================================================== */
/* Small helpers                                                              */
/* ========================================================================== */

function viewerOf(ctx: AuthContext): MarksViewer {
  return {
    role: ctx.role,
    staffId: ctx.staffId,
    canEnter: can(ctx, 'marks.enter'),
    canUpdate: can(ctx, 'marks.update'),
    canUpdateSubmitted: can(ctx, 'marks.update_submitted'),
  }
}

const decimalToString = (value: Prisma.Decimal | null) => (value === null ? null : value.toString())

function countsOf(marks: readonly { status: MarkStatusValue }[]): MarkSheetCounts {
  const counts = { total: marks.length, entered: 0, absent: 0, pending: 0 }
  for (const mark of marks) {
    if (mark.status === 'ENTERED') counts.entered += 1
    else if (mark.status === 'ABSENT') counts.absent += 1
    else counts.pending += 1
  }
  return counts
}

interface RosterStudent {
  studentId: string
  studentCode: string
  fullName: string
  rollNumber: string | null
}

/**
 * Who is actually in this section right now.
 *
 * Rebuilt from ACTIVE enrollments every time, exactly as the attendance
 * register does. A student who transfers out stops appearing; one who transfers
 * in appears with no mark yet, which is `PENDING` and blocks submission until
 * somebody looks at their paper.
 */
async function loadRoster(sectionId: string, academicSessionId: string): Promise<RosterStudent[]> {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { sectionId, academicSessionId, status: 'ACTIVE', student: { deletedAt: null } },
    orderBy: [{ rollNumber: 'asc' }, { student: { fullName: 'asc' } }],
    select: {
      rollNumber: true,
      student: { select: { id: true, studentCode: true, fullName: true } },
    },
  })

  return enrollments.map((e) => ({
    studentId: e.student.id,
    studentCode: e.student.studentCode,
    fullName: e.student.fullName,
    rollNumber: e.rollNumber,
  }))
}

/* ========================================================================== */
/* Resolving a paper and a section                                            */
/* ========================================================================== */

interface ResolvedTarget {
  paper: MarkSheetPaper
  sectionId: string
  sectionName: string
  divisionName: string
  context: MarkingContext
}

/**
 * Refuses anyone who could never enter marks, from the session alone.
 *
 * This runs **before** anything is looked up. Without it, a caller with no
 * business here learns from the difference between 404 and 403 whether a paper
 * id exists, and every probe costs the database a query (ADR-097).
 */
function assertCouldEnterMarks(ctx: AuthContext): void {
  const viewer = viewerOf(ctx)
  if (!viewer.canEnter || (viewer.role !== 'ADMIN' && viewer.role !== 'STAFF')) {
    throw new ForbiddenError('You do not have permission to enter marks.', {
      userId: ctx.userId,
      role: ctx.role,
      code: 'NO_PERMISSION',
    })
  }
}

/**
 * Loads a paper and a section and proves they belong together.
 *
 * Four things have to line up, and every one is checked against the database
 * rather than taken from the request: the section is in the paper's academic
 * session, it is a section of the paper's class, its programme is one the paper
 * covers, and — for a teacher — an ACTIVE assignment exists for that section
 * and the paper's own subject.
 */
async function resolveTarget(
  ctx: AuthContext,
  examPaperId: string,
  sectionId: string,
): Promise<ResolvedTarget> {
  const paper = await prisma.examPaper.findUnique({
    where: { id: examPaperId },
    select: {
      id: true,
      isActive: true,
      classId: true,
      programId: true,
      subjectId: true,
      academicSessionId: true,
      examDate: true,
      startTime: true,
      endTime: true,
      maxMarks: true,
      passingPercentage: true,
      subject: { select: { name: true } },
      class: { select: { name: true, displayName: true } },
      program: { select: { name: true } },
      exam: {
        select: {
          id: true,
          name: true,
          status: true,
          examType: { select: { name: true } },
          academicSession: { select: { name: true } },
        },
      },
    },
  })
  if (!paper) throw new NotFoundError('exam paper')
  if (!paper.isActive) {
    throw new ValidationError('That paper is no longer active, so it cannot be marked.')
  }

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      name: true,
      isActive: true,
      academicSessionId: true,
      academicGroup: {
        select: {
          isActive: true,
          classId: true,
          programId: true,
          division: { select: { name: true } },
        },
      },
    },
  })
  if (!section) throw new NotFoundError('section')

  const mismatch =
    section.academicSessionId !== paper.academicSessionId ||
    section.academicGroup.classId !== paper.classId ||
    (paper.programId !== null && section.academicGroup.programId !== paper.programId)

  // One message for every way the pair can fail to match, so a caller probing
  // combinations learns nothing about which part was wrong.
  if (mismatch) {
    throw new ValidationError('That section does not sit this paper.')
  }

  if (!section.isActive || !section.academicGroup.isActive) {
    throw new ValidationError('That section is no longer active, so its papers cannot be marked.')
  }

  // Only the signed-in teacher's own records are consulted.
  const hasActiveAssignment = ctx.staffId
    ? (await prisma.teacherAssignment.findFirst({
        where: {
          staffId: ctx.staffId,
          sectionId: section.id,
          subjectId: paper.subjectId,
          isActive: true,
        },
        select: { id: true },
      })) !== null
    : false

  return {
    paper: {
      examId: paper.exam.id,
      examName: paper.exam.name,
      examTypeName: paper.exam.examType.name,
      examStatus: paper.exam.status as ExamStatusValue,
      academicSessionId: paper.academicSessionId,
      sessionName: paper.exam.academicSession.name,
      examPaperId: paper.id,
      subjectId: paper.subjectId,
      subjectName: paper.subject.name,
      classId: paper.classId,
      className: paper.class.displayName ?? paper.class.name,
      programId: paper.programId,
      programName: paper.program?.name ?? null,
      examDate: paper.examDate ? storageToCollegeDate(paper.examDate) : null,
      startTime: paper.startTime,
      endTime: paper.endTime,
      maxMarks: paper.maxMarks.toString(),
      passingPercentage: paper.passingPercentage.toString(),
    },
    sectionId: section.id,
    sectionName: section.name,
    divisionName: section.academicGroup.division.name,
    context: {
      hasActiveAssignment,
      examStatus: paper.exam.status as ExamStatusValue,
    },
  }
}

/** The reusable check the whole feature is built on. */
async function assertCanEnterMarks(
  ctx: AuthContext,
  examPaperId: string,
  sectionId: string,
): Promise<ResolvedTarget> {
  assertCouldEnterMarks(ctx)

  const target = await resolveTarget(ctx, examPaperId, sectionId)
  const decision = decideCanEnterMarks(viewerOf(ctx), target.context)
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      examPaperId,
    })
  }
  return target
}

/* ========================================================================== */
/* What this teacher may mark                                                 */
/* ========================================================================== */

/**
 * Every paper the signed-in teacher may enter marks for, and what already
 * exists for each.
 *
 * Built from their own ACTIVE `TeacherAssignment` records, resolved from
 * `ctx.staffId`. There is no parameter for whose list it is, so a teacher
 * cannot ask for somebody else's.
 *
 * This decides what the *screen offers*. It is not the security boundary:
 * `assertCanEnterMarks` checks the same facts again when a sheet is opened or
 * saved.
 */
export async function getMyExamPapers(ctx: AuthContext): Promise<MyPaperOption[]> {
  authorize(ctx, 'exams.view')

  if (ctx.role !== 'STAFF' || !ctx.staffId) {
    throw new ForbiddenError('The staff portal is only available to staff accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const assignments = await prisma.teacherAssignment.findMany({
    where: { staffId: ctx.staffId, isActive: true },
    select: {
      sectionId: true,
      subjectId: true,
      academicSessionId: true,
      section: {
        select: {
          name: true,
          academicGroup: {
            select: {
              classId: true,
              programId: true,
              division: { select: { name: true } },
            },
          },
          _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
        },
      },
    },
  })

  if (assignments.length === 0) return []

  // One query for every paper any of those assignments could touch, rather than
  // one per assignment.
  const papers = await prisma.examPaper.findMany({
    where: {
      isActive: true,
      academicSessionId: { in: [...new Set(assignments.map((a) => a.academicSessionId))] },
      classId: { in: [...new Set(assignments.map((a) => a.section.academicGroup.classId))] },
      subjectId: { in: [...new Set(assignments.map((a) => a.subjectId))] },
      // Only exams whose date sheet is out and which are not finished.
      exam: { status: { in: ['SCHEDULED', 'MARKS_ENTRY'] } },
    },
    orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    select: {
      id: true,
      classId: true,
      programId: true,
      subjectId: true,
      academicSessionId: true,
      examDate: true,
      startTime: true,
      endTime: true,
      maxMarks: true,
      passingPercentage: true,
      subject: { select: { name: true } },
      class: { select: { name: true, displayName: true } },
      program: { select: { name: true } },
      exam: {
        select: {
          id: true,
          name: true,
          status: true,
          examType: { select: { name: true } },
          academicSession: { select: { name: true } },
        },
      },
    },
  })

  const options: MyPaperOption[] = []
  for (const assignment of assignments) {
    const group = assignment.section.academicGroup
    for (const paper of papers) {
      if (paper.academicSessionId !== assignment.academicSessionId) continue
      if (paper.classId !== group.classId) continue
      if (paper.subjectId !== assignment.subjectId) continue
      if (paper.programId !== null && paper.programId !== group.programId) continue

      options.push({
        examId: paper.exam.id,
        examName: paper.exam.name,
        examTypeName: paper.exam.examType.name,
        examStatus: paper.exam.status as ExamStatusValue,
        academicSessionId: paper.academicSessionId,
        sessionName: paper.exam.academicSession.name,
        examPaperId: paper.id,
        subjectId: paper.subjectId,
        subjectName: paper.subject.name,
        classId: paper.classId,
        className: paper.class.displayName ?? paper.class.name,
        programId: paper.programId,
        programName: paper.program?.name ?? null,
        examDate: paper.examDate ? storageToCollegeDate(paper.examDate) : null,
        startTime: paper.startTime,
        endTime: paper.endTime,
        maxMarks: paper.maxMarks.toString(),
        passingPercentage: paper.passingPercentage.toString(),
        sectionId: assignment.sectionId,
        sectionName: assignment.section.name,
        divisionName: group.division.name,
        studentCount: assignment.section._count.enrollments,
        sheet: null,
      })
    }
  }

  if (options.length === 0) return []

  // And one query for the sheets that already exist.
  const sheets = await prisma.examMarkSheet.findMany({
    where: {
      examPaperId: { in: [...new Set(options.map((o) => o.examPaperId))] },
      sectionId: { in: [...new Set(options.map((o) => o.sectionId))] },
    },
    select: {
      id: true,
      examPaperId: true,
      sectionId: true,
      status: true,
      submittedAt: true,
      marks: { select: { status: true } },
    },
  })

  const byKey = new Map(sheets.map((s) => [`${s.examPaperId}:${s.sectionId}`, s]))
  for (const option of options) {
    const sheet = byKey.get(`${option.examPaperId}:${option.sectionId}`)
    if (!sheet) continue
    option.sheet = {
      id: sheet.id,
      status: sheet.status as MarkSheetStatusValue,
      submittedAt: sheet.submittedAt?.toISOString() ?? null,
      counts: countsOf(sheet.marks as { status: MarkStatusValue }[]),
    }
  }

  return options.sort(
    (a, b) =>
      (a.examDate ?? '9999').localeCompare(b.examDate ?? '9999') ||
      a.subjectName.localeCompare(b.subjectName) ||
      a.sectionName.localeCompare(b.sectionName),
  )
}

/* ========================================================================== */
/* Opening a mark sheet                                                       */
/* ========================================================================== */

/**
 * Opens the mark sheet for one paper and section, or returns the existing one.
 *
 * Every student on the roster gets a `PENDING` mark straight away, so the
 * difference between "not looked at yet" and "scored nothing" exists from the
 * first moment rather than being inferred later.
 *
 * Opening the first sheet moves the exam from `SCHEDULED` to `MARKS_ENTRY`.
 * That is the existing lifecycle doing its job: from then on the office can no
 * longer withdraw the date sheet, which is exactly right once teachers have
 * started marking against it.
 */
export async function openMarkSheet(
  ctx: AuthContext,
  input: OpenMarkSheetInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<MarkSheetDetail> {
  const target = await assertCanEnterMarks(ctx, input.examPaperId, input.sectionId)

  const existing = await prisma.examMarkSheet.findUnique({
    where: { examPaperId_sectionId: { examPaperId: target.paper.examPaperId, sectionId: target.sectionId } },
    select: { id: true },
  })
  if (existing) return getMarkSheet(ctx, existing.id)

  const roster = await loadRoster(target.sectionId, target.paper.academicSessionId)
  if (roster.length === 0) {
    throw new ValidationError(
      'No students are enrolled in this section, so there is nothing to mark.',
    )
  }

  // The teacher whose marks these are. An administrator keying in a paper on a
  // teacher's behalf is recorded as the assigned teacher when there is one, so
  // the sheet still says whose marks they are.
  const enteredByStaffId =
    ctx.staffId ??
    (
      await prisma.teacherAssignment.findFirst({
        where: {
          sectionId: target.sectionId,
          subjectId: target.paper.subjectId,
          isActive: true,
        },
        select: { staffId: true },
      })
    )?.staffId

  if (!enteredByStaffId) {
    throw new ValidationError(
      'No teacher is assigned to this subject in this section, so there is nobody to record the marks against. Add a teaching assignment first.',
    )
  }

  const sheetId = await prisma.$transaction(async (tx) => {
    const sheet = await tx.examMarkSheet.create({
      data: {
        examPaperId: target.paper.examPaperId,
        academicSessionId: target.paper.academicSessionId,
        sectionId: target.sectionId,
        status: 'DRAFT',
        enteredByStaffId,
        createdByUserId: ctx.userId,
      },
      select: { id: true },
    })

    await tx.mark.createMany({
      data: roster.map((student) => ({
        markSheetId: sheet.id,
        examPaperId: target.paper.examPaperId,
        studentId: student.studentId,
        status: 'PENDING' as const,
      })),
    })

    if (target.paper.examStatus === 'SCHEDULED') {
      await tx.exam.update({
        where: { id: target.paper.examId },
        data: { status: 'MARKS_ENTRY', updatedByUserId: ctx.userId },
      })
      await writeAuditLog(
        ctx,
        {
          action: 'exam.status_changed',
          entityType: 'exam',
          entityId: target.paper.examId,
          entityLabel: target.paper.examName,
          before: { status: 'SCHEDULED' },
          after: { status: 'MARKS_ENTRY' },
          metadata: { reason: 'first mark sheet opened' },
        },
        tx,
      )
    }

    await writeAuditLog(
      ctx,
      {
        action: 'mark_sheet.opened',
        entityType: 'ExamMarkSheet',
        entityId: sheet.id,
        entityLabel: `${target.paper.examName} · ${target.paper.subjectName} · ${target.paper.className} ${target.sectionName}`,
        after: { studentCount: roster.length },
        request,
      },
      tx,
    )

    return sheet.id
  })

  return getMarkSheet(ctx, sheetId)
}

/* ========================================================================== */
/* Reading a mark sheet                                                       */
/* ========================================================================== */

interface LoadedSheet {
  id: string
  examPaperId: string
  sectionId: string
  status: MarkSheetStatusValue
  enteredByStaffId: string
  enteredByName: string
  submittedAt: Date | null
  updatedAt: Date
}

async function loadSheet(sheetId: string): Promise<LoadedSheet> {
  const sheet = await prisma.examMarkSheet.findUnique({
    where: { id: sheetId },
    select: {
      id: true,
      examPaperId: true,
      sectionId: true,
      status: true,
      enteredByStaffId: true,
      submittedAt: true,
      updatedAt: true,
      enteredBy: { select: { fullName: true } },
    },
  })
  if (!sheet) throw new NotFoundError('mark sheet')

  return {
    id: sheet.id,
    examPaperId: sheet.examPaperId,
    sectionId: sheet.sectionId,
    status: sheet.status as MarkSheetStatusValue,
    enteredByStaffId: sheet.enteredByStaffId,
    enteredByName: sheet.enteredBy.fullName,
    submittedAt: sheet.submittedAt,
    updatedAt: sheet.updatedAt,
  }
}

/**
 * One mark sheet, with the roster as it stands now.
 *
 * The roster is the source of truth for *who* is on the sheet; the stored marks
 * supply the values. A student who joined after the sheet was opened appears
 * with no mark, which is `PENDING` and blocks submission until it is filled in.
 */
export async function getMarkSheet(ctx: AuthContext, sheetId: string): Promise<MarkSheetDetail> {
  assertCouldEnterMarks(ctx)

  const sheet = await loadSheet(sheetId)
  const target = await resolveTarget(ctx, sheet.examPaperId, sheet.sectionId)

  const decision = decideCanEnterMarks(
    { ...viewerOf(ctx), canEnter: true },
    // Reading a sheet does not depend on the exam still being open for marking:
    // a teacher must be able to look at what they submitted.
    { ...target.context, examStatus: 'MARKS_ENTRY' },
  )
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sheetId,
    })
  }

  const [roster, marks] = await Promise.all([
    loadRoster(sheet.sectionId, target.paper.academicSessionId),
    prisma.mark.findMany({
      where: { markSheetId: sheet.id },
      select: { studentId: true, status: true, obtainedMarks: true, remarks: true },
    }),
  ])

  const byStudent = new Map(marks.map((m) => [m.studentId, m]))

  const rows: MarkRow[] = roster.map((student) => {
    const mark = byStudent.get(student.studentId)
    return {
      studentId: student.studentId,
      studentCode: student.studentCode,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      status: (mark?.status as MarkStatusValue) ?? 'PENDING',
      obtainedMarks: mark ? decimalToString(mark.obtainedMarks) : null,
      remarks: mark?.remarks ?? null,
    }
  })

  const viewer = viewerOf(ctx)
  const edit = decideCanEditMarks(viewer, target.context, { status: sheet.status })
  const submit = decideCanSubmitMarks(viewer, target.context, { status: sheet.status })

  return {
    ...target.paper,
    id: sheet.id,
    sectionId: sheet.sectionId,
    sectionName: target.sectionName,
    divisionName: target.divisionName,
    status: sheet.status,
    enteredByStaffId: sheet.enteredByStaffId,
    enteredByName: sheet.enteredByName,
    submittedAt: sheet.submittedAt?.toISOString() ?? null,
    updatedAt: sheet.updatedAt.toISOString(),
    counts: countsOf(rows),
    marks: rows,
    canEdit: edit.allowed,
    canSubmit: submit.allowed,
  }
}

/* ========================================================================== */
/* Saving marks                                                               */
/* ========================================================================== */

/** What one row means once the paper's maximum is known. */
interface NormalisedRow {
  studentId: string
  studentCode: string
  status: MarkStatusValue
  obtainedMarks: string | null
  remarks: string | null
}

/**
 * Turns the request into rows that are safe to store, or refuses the lot.
 *
 * Every row is checked before anything is written: an unknown student, a mark
 * above the paper's maximum, or a status that disagrees with its value stops
 * the whole save. Half-saving a sheet would leave the teacher unable to tell
 * which marks went in.
 */
function normaliseRows(
  input: SaveMarksInput,
  roster: readonly RosterStudent[],
  maxMarksHundredths: number,
  maxMarksLabel: string,
): NormalisedRow[] {
  const byStudent = new Map(roster.map((student) => [student.studentId, student]))
  const seen = new Set<string>()
  const rows: NormalisedRow[] = []

  for (const row of input.rows) {
    const student = byStudent.get(row.studentId)
    if (!student) {
      throw new ValidationError('That list includes a student who is not in this section.')
    }
    if (seen.has(row.studentId)) {
      throw new ValidationError(`${student.fullName} appears twice in the same save.`)
    }
    seen.add(row.studentId)

    if (row.status === 'PENDING') {
      rows.push({
        studentId: row.studentId,
        studentCode: student.studentCode,
        status: 'PENDING',
        obtainedMarks: null,
        remarks: row.remarks ?? null,
      })
      continue
    }

    if (row.status === 'ABSENT') {
      // Absence scores zero, and the zero is written explicitly so the database
      // CHECK constraint holds and nothing has to infer it later.
      rows.push({
        studentId: row.studentId,
        studentCode: student.studentCode,
        status: 'ABSENT',
        obtainedMarks: '0.00',
        remarks: row.remarks ?? null,
      })
      continue
    }

    const hundredths = row.obtainedMarks === undefined ? null : tryHundredths(row.obtainedMarks)
    if (hundredths === null) {
      throw new ValidationError(
        `${student.fullName}: enter a mark with at most two decimal places, or mark them absent.`,
        { [row.studentId]: ['Enter a mark, or mark the student absent.'] },
      )
    }
    if (hundredths > maxMarksHundredths) {
      throw new ValidationError(
        `${student.fullName}: ${row.obtainedMarks} is more than the paper's ${maxMarksLabel} marks.`,
        { [row.studentId]: [`The most this paper carries is ${maxMarksLabel}.`] },
      )
    }

    rows.push({
      studentId: row.studentId,
      studentCode: student.studentCode,
      status: 'ENTERED',
      obtainedMarks: fromHundredths(hundredths),
      remarks: row.remarks ?? null,
    })
  }

  return rows
}

/**
 * Saves a whole sheet in one transaction.
 *
 * One request rather than one per student, and all-or-nothing: if any row is
 * wrong, nothing is written. Partial saves would be worse than a failure —
 * the teacher would have no way to know which marks landed.
 *
 * `expectedUpdatedAt` is optimistic concurrency, not a lock. If the sheet has
 * moved on since the browser loaded it — another teacher saved, or the office
 * submitted it — the save is refused with a conflict instead of quietly
 * overwriting somebody's work.
 */
export async function saveMarks(
  ctx: AuthContext,
  sheetId: string,
  input: SaveMarksInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<MarkSheetDetail> {
  assertCouldEnterMarks(ctx)

  const sheet = await loadSheet(sheetId)
  const target = await resolveTarget(ctx, sheet.examPaperId, sheet.sectionId)

  const decision = decideCanEditMarks(viewerOf(ctx), target.context, { status: sheet.status })
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sheetId,
    })
  }

  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== sheet.updatedAt.toISOString()) {
    throw new ConflictError(
      'Somebody else changed this mark sheet while you were working on it. Reload the page to see their marks before saving yours.',
    )
  }

  const roster = await loadRoster(sheet.sectionId, target.paper.academicSessionId)
  const rows = normaliseRows(
    input,
    roster,
    toHundredths(target.paper.maxMarks),
    target.paper.maxMarks,
  )

  const existing = await prisma.mark.findMany({
    where: { markSheetId: sheet.id },
    select: { id: true, studentId: true, status: true, obtainedMarks: true },
  })
  const byStudent = new Map(existing.map((m) => [m.studentId, m]))

  /**
   * Only what actually moved is audited, and only the safe parts of it: a
   * student code, the statuses, and the marks. No name, no identity document,
   * nothing from the student's file.
   */
  // Compared as numbers, not as text: the database returns `0` where the row
  // being written says `0.00`, and treating those as different would log a
  // change on every save and inflate the count.
  const sameMarks = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : tryHundredths(a) === tryHundredths(b)

  const changes = rows
    .map((row) => {
      const before = byStudent.get(row.studentId)
      const beforeStatus = (before?.status as MarkStatusValue) ?? 'PENDING'
      const beforeRaw = before ? decimalToString(before.obtainedMarks) : null
      if (beforeStatus === row.status && sameMarks(beforeRaw, row.obtainedMarks)) return null

      // Both sides are written the same way, so a reader can compare them.
      const beforeHundredths = beforeRaw === null ? null : tryHundredths(beforeRaw)
      return {
        studentCode: row.studentCode,
        from: {
          status: beforeStatus,
          marks: beforeHundredths === null ? null : fromHundredths(beforeHundredths),
        },
        to: { status: row.status, marks: row.obtainedMarks },
      }
    })
    .filter((change): change is NonNullable<typeof change> => change !== null)

  const newlyFilled = changes.filter((c) => c.from.status === 'PENDING').length

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const current = byStudent.get(row.studentId)
        if (current) {
          await tx.mark.update({
            where: { id: current.id },
            data: {
              status: row.status,
              obtainedMarks: row.obtainedMarks,
              remarks: row.remarks,
              updatedByUserId: ctx.userId,
            },
          })
        } else {
          // A student who joined the section after the sheet was opened.
          await tx.mark.create({
            data: {
              markSheetId: sheet.id,
              examPaperId: sheet.examPaperId,
              studentId: row.studentId,
              status: row.status,
              obtainedMarks: row.obtainedMarks,
              remarks: row.remarks,
              updatedByUserId: ctx.userId,
            },
          })
        }
      }

      await tx.examMarkSheet.update({
        where: { id: sheet.id },
        data: { updatedByUserId: ctx.userId },
      })

      if (changes.length > 0) {
        await writeAuditLog(
          ctx,
          {
            action:
              sheet.status !== 'DRAFT'
                ? 'marks.corrected'
                : newlyFilled > 0
                  ? 'marks.entered'
                  : 'marks.updated',
            entityType: 'ExamMarkSheet',
            entityId: sheet.id,
            entityLabel: `${target.paper.examName} · ${target.paper.subjectName} · ${target.paper.className} ${target.sectionName}`,
            after: { changedCount: changes.length, changes },
            request,
          },
          tx,
        )
      }
    })
  } catch (error) {
    // One mark per student per paper. A student who has already been marked on
    // this paper in another section cannot be marked again here.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      throw new ConflictError(
        'One of these students already has a mark for this paper in another section. Ask the office to sort out their enrollment first.',
      )
    }
    throw error
  }

  return getMarkSheet(ctx, sheetId)
}

/* ========================================================================== */
/* Submitting                                                                 */
/* ========================================================================== */

/**
 * Hands the sheet in.
 *
 * Every student currently enrolled must be `ENTERED` or `ABSENT` first. A
 * `PENDING` row means nobody has looked at that paper, and freezing it into the
 * record is exactly what the three-state model exists to prevent.
 */
export async function submitMarkSheet(
  ctx: AuthContext,
  sheetId: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<MarkSheetDetail> {
  assertCouldEnterMarks(ctx)

  const sheet = await loadSheet(sheetId)
  const target = await resolveTarget(ctx, sheet.examPaperId, sheet.sectionId)

  const decision = decideCanSubmitMarks(viewerOf(ctx), target.context, { status: sheet.status })
  if (!decision.allowed) {
    // Already submitted is a conflict, not a permission problem.
    if (decision.code === 'SHEET_SUBMITTED' && sheet.status !== 'DRAFT') {
      throw new ConflictError('These marks have already been submitted.')
    }
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sheetId,
    })
  }

  const detail = await getMarkSheet(ctx, sheetId)
  const unentered = findUnenteredStudents(detail.marks)

  if (unentered.length > 0) {
    throw new ValidationError(
      unentered.length === 1
        ? `${unentered[0]?.fullName} has no mark yet. Enter a mark, or mark them absent, before submitting.`
        : `${unentered.length} students have no mark yet. Enter a mark, or mark them absent, before submitting.`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.examMarkSheet.update({
      where: { id: sheet.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), updatedByUserId: ctx.userId },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'marks.submitted',
        entityType: 'ExamMarkSheet',
        entityId: sheet.id,
        entityLabel: `${target.paper.examName} · ${target.paper.subjectName} · ${target.paper.className} ${target.sectionName}`,
        after: {
          studentCount: detail.counts.total,
          entered: detail.counts.entered,
          absent: detail.counts.absent,
        },
        request,
      },
      tx,
    )
  })

  return getMarkSheet(ctx, sheetId)
}

/* ========================================================================== */
/* Admin monitoring                                                           */
/* ========================================================================== */

export interface MarkSheetStatusRow {
  examPaperId: string
  subjectName: string
  className: string
  programName: string | null
  sectionId: string
  sectionName: string
  divisionName: string
  teacherName: string | null
  sheetId: string | null
  status: MarkSheetStatusValue | null
  submittedAt: string | null
  counts: MarkSheetCounts
}

/**
 * Which papers have been marked, and which have not.
 *
 * One row per paper and section the exam covers, whether a sheet has been
 * opened or not — an unopened sheet is the interesting case, because it is the
 * teacher who has not started. Status monitoring only: no marks are returned.
 */
export async function listExamMarkSheets(
  ctx: AuthContext,
  examId: string,
): Promise<MarkSheetStatusRow[]> {
  assertAdminArea(ctx, 'Mark sheet monitoring')
  authorize(ctx, 'marks.view')

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, academicSessionId: true },
  })
  if (!exam) throw new NotFoundError('exam')

  const [papers, sections, sheets, assignments] = await Promise.all([
    prisma.examPaper.findMany({
      where: { examId, isActive: true },
      orderBy: [{ examDate: 'asc' }, { subject: { name: 'asc' } }],
      select: {
        id: true,
        classId: true,
        programId: true,
        subjectId: true,
        subject: { select: { name: true } },
        class: { select: { name: true, displayName: true } },
        program: { select: { name: true } },
      },
    }),
    prisma.section.findMany({
      where: { academicSessionId: exam.academicSessionId, isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        academicGroup: {
          select: { classId: true, programId: true, division: { select: { name: true } } },
        },
      },
    }),
    prisma.examMarkSheet.findMany({
      where: { examPaper: { examId } },
      select: {
        id: true,
        examPaperId: true,
        sectionId: true,
        status: true,
        submittedAt: true,
        enteredBy: { select: { fullName: true } },
        marks: { select: { status: true } },
      },
    }),
    prisma.teacherAssignment.findMany({
      where: { academicSessionId: exam.academicSessionId, isActive: true },
      select: { sectionId: true, subjectId: true, staff: { select: { fullName: true } } },
    }),
  ])

  const sheetByKey = new Map(sheets.map((s) => [`${s.examPaperId}:${s.sectionId}`, s]))
  const teacherByKey = new Map(
    assignments.map((a) => [`${a.sectionId}:${a.subjectId}`, a.staff.fullName]),
  )

  const rows: MarkSheetStatusRow[] = []

  for (const paper of papers) {
    for (const section of sections) {
      const group = section.academicGroup
      if (group.classId !== paper.classId) continue
      if (paper.programId !== null && group.programId !== paper.programId) continue

      const sheet = sheetByKey.get(`${paper.id}:${section.id}`)
      rows.push({
        examPaperId: paper.id,
        subjectName: paper.subject.name,
        className: paper.class.displayName ?? paper.class.name,
        programName: paper.program?.name ?? null,
        sectionId: section.id,
        sectionName: section.name,
        divisionName: group.division.name,
        teacherName:
          sheet?.enteredBy.fullName ?? teacherByKey.get(`${section.id}:${paper.subjectId}`) ?? null,
        sheetId: sheet?.id ?? null,
        status: (sheet?.status as MarkSheetStatusValue) ?? null,
        submittedAt: sheet?.submittedAt?.toISOString() ?? null,
        counts: sheet
          ? countsOf(sheet.marks as { status: MarkStatusValue }[])
          : { total: 0, entered: 0, absent: 0, pending: 0 },
      })
    }
  }

  return rows
}

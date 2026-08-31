/**
 * Attendance: marking, correcting, submitting and reading registers.
 *
 * Three rules shape this file.
 *
 * **Nothing the browser sends is proof of anything.** A request may name a
 * section, a subject and a list of students. Every one of those is a claim. The
 * roster is rebuilt from `student_enrollments` on the server, the academic
 * session is derived from the section rather than accepted, and who may mark
 * what is decided from `teacher_assignments` and `section_incharges`.
 *
 * **History is never rewritten.** A register belongs to the section it was taken
 * in, so a student who transfers in March keeps their January attendance exactly
 * as it was. Nothing is ever deleted; a class that did not happen is CANCELLED.
 *
 * **Only submitted registers count.** A draft is a teacher still working, and a
 * cancelled sheet is a class that did not happen. Percentages come from
 * SUBMITTED sheets alone.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, can, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { readSetting } from '../settings/settings-store'
import { paginate, paginatedResult, withUniqueConstraintHandling, type PaginatedResult } from './service-utils'
import {
  collegeDateToStorage,
  isValidCollegeDate,
  storageToCollegeDate,
  todayInCollegeTimezone,
} from '../time/college-date'
import {
  COUNTED_SHEET_STATUS,
  EMPTY_COUNTS,
  checkAttendanceDate,
  countStatuses,
  countsFromGroups,
  isValidPeriod,
  summarise,
  type AttendanceCounts,
  type AttendanceSummary,
} from '../attendance/attendance-policy'
import {
  decideCanCancelSheet,
  decideCanEditSheet,
  decideCanMarkAttendance,
  type AttendanceViewer,
  type MarkingContext,
} from '../attendance/access'
import type {
  AttendanceSheetCreateInput,
  AttendanceSheetListQuery,
} from '@/validation/attendance'
import type { Prisma } from '@/generated/prisma/client'
import type { AttendanceStatus, SheetStatus } from '@/generated/prisma/enums'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface AttendanceSheetListItem {
  id: string
  date: string
  period: number
  status: SheetStatus
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  subjectId: string | null
  subjectName: string | null
  markedByStaffId: string
  markedByName: string
  submittedAt: string | null
  studentCount: number
  /** How the marks fell on this register. Filled in by the list and detail. */
  counts: AttendanceCounts
}

export interface AttendanceSheetDetail extends AttendanceSheetListItem {
  academicSessionId: string
  cancelledReason: string | null
  /**
   * The percentage for this one register, using the college's own rule. Sent
   * from the server so no screen ever computes it a second, different way.
   */
  percentage: number | null
  entries: Array<{
    id: string
    studentId: string
    studentCode: string
    fullName: string
    /** Shown on the register so a teacher can tell two same-named students apart. */
    fatherName: string | null
    rollNumber: string | null
    status: AttendanceStatus
    remarks: string | null
  }>
}

/* -------------------------------------------------------------------------- */
/* Authorization — the single entry point                                     */
/* -------------------------------------------------------------------------- */

/** Everything the service resolved while checking permission, reused by callers. */
export interface ResolvedMarkingTarget {
  sectionId: string
  academicSessionId: string
  subjectId: string | null
  sectionName: string
  classId: string
  programId: string
}

function viewerOf(ctx: AuthContext): AttendanceViewer {
  return {
    role: ctx.role,
    staffId: ctx.staffId,
    canCreate: can(ctx, 'attendance.create'),
    canUpdate: can(ctx, 'attendance.update'),
    canUpdateSubmitted: can(ctx, 'attendance.update_submitted'),
  }
}

/**
 * Loads the section, validates the subject against the curriculum, and works out
 * whether this person may mark it.
 *
 * The academic session is taken from the **section**, never from the request.
 * A section belongs to exactly one session, so there is nothing for the browser
 * to tell us and nothing to disagree about.
 */
async function resolveMarkingTarget(
  ctx: AuthContext,
  sectionId: string,
  subjectId: string | null,
): Promise<{ target: ResolvedMarkingTarget; context: MarkingContext }> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      name: true,
      isActive: true,
      academicSessionId: true,
      academicGroup: {
        select: {
          classId: true,
          programId: true,
          isActive: true,
        },
      },
    },
  })

  if (!section) throw new NotFoundError('section')
  if (!section.isActive || !section.academicGroup.isActive) {
    throw new ValidationError('That section is no longer active, so attendance cannot be marked for it.')
  }

  // A subject must actually be taught to this class and program.
  if (subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, isActive: true },
    })
    if (!subject) throw new NotFoundError('subject')
    if (!subject.isActive) {
      throw new ValidationError(`${subject.name} is no longer taught.`)
    }

    const inCurriculum = await prisma.curriculumSubject.findFirst({
      where: {
        academicSessionId: section.academicSessionId,
        classId: section.academicGroup.classId,
        programId: section.academicGroup.programId,
        subjectId,
      },
      select: { id: true },
    })
    if (!inCurriculum) {
      throw new ValidationError(
        `${subject.name} is not part of this section's curriculum. Add it on the Curriculum screen first.`,
      )
    }
  }

  // Only look up the teacher's own records — never anything sent in the request.
  let hasActiveAssignment = false
  let isActiveIncharge = false

  if (ctx.staffId) {
    if (subjectId) {
      hasActiveAssignment =
        (await prisma.teacherAssignment.findFirst({
          where: { staffId: ctx.staffId, sectionId, subjectId, isActive: true },
          select: { id: true },
        })) !== null
    } else {
      isActiveIncharge =
        (await prisma.sectionIncharge.findFirst({
          where: { staffId: ctx.staffId, sectionId, isActive: true },
          select: { id: true },
        })) !== null
    }
  }

  return {
    target: {
      sectionId: section.id,
      academicSessionId: section.academicSessionId,
      subjectId,
      sectionName: section.name,
      classId: section.academicGroup.classId,
      programId: section.academicGroup.programId,
    },
    context: { subjectId, hasActiveAssignment, isActiveIncharge },
  }
}

/**
 * The reusable check the whole attendance feature is built on.
 *
 * Subject-wise marking needs an ACTIVE teaching assignment for that exact
 * section **and** subject; daily roll-call needs to be the section's ACTIVE
 * in-charge. Section-level scope is not enough on its own, which is why this
 * does not simply call `getScopedSectionIds()` — that answers "which sections",
 * not "which subject".
 */
export async function assertCanMarkAttendance(
  ctx: AuthContext,
  sectionId: string,
  subjectId: string | null,
): Promise<ResolvedMarkingTarget> {
  /**
   * Refuse anyone who could never mark attendance *before* looking anything up.
   *
   * Without this, a caller with no business here learns from the difference
   * between 404 and 403 whether a section id exists — and every probe costs the
   * database a query. A student never holds `attendance.create`, so this is
   * settled from the session alone.
   */
  const viewer = viewerOf(ctx)
  if (!viewer.canCreate || (viewer.role !== 'ADMIN' && viewer.role !== 'STAFF')) {
    throw new ForbiddenError('You do not have permission to mark attendance.', {
      userId: ctx.userId,
      role: ctx.role,
      code: 'NO_PERMISSION',
    })
  }

  const { target, context } = await resolveMarkingTarget(ctx, sectionId, subjectId)

  const decision = decideCanMarkAttendance(viewerOf(ctx), context)
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sectionId,
    })
  }

  return target
}

/** Whether this person may *see* a sheet, which is broader than marking it. */
async function assertCanViewSection(ctx: AuthContext, sectionId: string): Promise<void> {
  authorize(ctx, 'attendance.view')
  if (ctx.role === 'ADMIN') return

  if (ctx.role === 'STAFF' && ctx.staffId) {
    // A teacher may read any register for a section they teach in or run, even
    // one somebody else marked — they need to see what was recorded for their
    // own class. Marking it is the narrower right, checked separately.
    const [assignment, incharge] = await Promise.all([
      prisma.teacherAssignment.findFirst({
        where: { staffId: ctx.staffId, sectionId, isActive: true },
        select: { id: true },
      }),
      prisma.sectionIncharge.findFirst({
        where: { staffId: ctx.staffId, sectionId, isActive: true },
        select: { id: true },
      }),
    ])
    if (assignment || incharge) return
  }

  throw new ForbiddenError('You can only see attendance for your own sections.', {
    userId: ctx.userId,
    role: ctx.role,
  })
}

/* -------------------------------------------------------------------------- */
/* The roster                                                                 */
/* -------------------------------------------------------------------------- */

interface RosterStudent {
  studentId: string
  studentCode: string
  fullName: string
  rollNumber: string | null
}

/**
 * Who is actually in this section right now.
 *
 * Rebuilt from ACTIVE enrollments every time. A client cannot add a student to a
 * register by sending an extra id, and cannot remove one by leaving an id out.
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

/* -------------------------------------------------------------------------- */
/* Creating a register                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Creates a register and one entry per student currently enrolled.
 *
 * The sheet starts as **DRAFT** and its entries default to **PRESENT**, which is
 * how a paper register works: names are called and the absentees are marked. The
 * safety is that a draft counts towards nothing at all — no percentage, no
 * report — until somebody submits it deliberately. A caller that already knows
 * the statuses can send them and skip the second round-trip.
 */
export async function createAttendanceSheet(
  ctx: AuthContext,
  input: AttendanceSheetCreateInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<AttendanceSheetDetail> {
  const subjectId = input.subjectId ?? null

  const target = await assertCanMarkAttendance(ctx, input.sectionId, subjectId)

  if (!isValidCollegeDate(input.date)) {
    throw new ValidationError('That is not a real calendar date.')
  }
  if (!isValidPeriod(input.period)) {
    throw new ValidationError('That period number is not valid.')
  }

  const dateRule = checkAttendanceDate({
    date: input.date,
    today: todayInCollegeTimezone(),
    isAdmin: ctx.role === 'ADMIN',
  })
  if (!dateRule.allowed) throw new ValidationError(dateRule.reason)

  const roster = await loadRoster(target.sectionId, target.academicSessionId)
  if (roster.length === 0) {
    throw new ValidationError('No active students are enrolled in this section.')
  }

  // Statuses the caller supplied, keyed by student — but only for students who
  // are genuinely on the roster. Anything else is refused rather than ignored,
  // so a mistake is visible instead of silently dropped.
  const supplied = new Map(input.entries?.map((e) => [e.studentId, e]) ?? [])
  const rosterIds = new Set(roster.map((s) => s.studentId))
  for (const studentId of supplied.keys()) {
    if (!rosterIds.has(studentId)) {
      throw new ValidationError('That list includes a student who is not enrolled in this section.')
    }
  }

  const storedDate = collegeDateToStorage(input.date)

  const markedByStaffId = await resolveMarker(ctx, input.markedByStaffId)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        const sheet = await tx.attendanceSheet.create({
          data: {
            sectionId: target.sectionId,
            academicSessionId: target.academicSessionId,
            subjectId,
            date: storedDate,
            period: input.period,
            markedByStaffId,
            status: 'DRAFT',
            createdByUserId: ctx.userId,
            updatedByUserId: ctx.userId,
          },
          select: { id: true },
        })

        await tx.attendanceEntry.createMany({
          data: roster.map((student) => ({
            sheetId: sheet.id,
            studentId: student.studentId,
            status: supplied.get(student.studentId)?.status ?? 'PRESENT',
            remarks: supplied.get(student.studentId)?.remarks ?? null,
            academicSessionId: target.academicSessionId,
            date: storedDate,
            updatedByUserId: ctx.userId,
          })),
        })

        await writeAuditLog(
          ctx,
          {
            action: 'attendance.sheet_created',
            entityType: 'AttendanceSheet',
            entityId: sheet.id,
            entityLabel: `${target.sectionName} · ${input.date} · period ${input.period}`,
            after: {
              date: input.date,
              period: input.period,
              subjectId,
              studentCount: roster.length,
              prefilled: supplied.size === 0,
            },
            request,
          },
          tx,
        )

        return sheet.id
      }),
    {
      // The index name contains these column names.
      section_id: 'Attendance for this section, subject, date and period has already been started.',
    },
    'Attendance for this class has already been started.',
  )

  return getAttendanceSheet(ctx, created)
}



/**
 * Whose name goes on the register.
 *
 * A teacher's register is always attributed to them — `markedByStaffId` from the
 * request is ignored, so nobody can file a register under a colleague's name.
 *
 * An administrator entering a paper register after the fact names the teacher
 * who actually took it. That is the honest record, and it is what makes the
 * date rule work: teachers mark today, and anything older goes through the
 * office without the office's name replacing the teacher's.
 */
async function resolveMarker(ctx: AuthContext, requested: string | undefined): Promise<string> {
  if (ctx.role === 'ADMIN' && requested) {
    const staff = await prisma.staff.findFirst({
      where: { id: requested, deletedAt: null },
      select: { id: true, employmentStatus: true, fullName: true },
    })
    if (!staff) throw new NotFoundError('staff record')
    if (staff.employmentStatus !== 'ACTIVE' && staff.employmentStatus !== 'ON_LEAVE') {
      throw new ValidationError(`${staff.fullName} is no longer working here.`)
    }
    return staff.id
  }

  if (ctx.staffId) return ctx.staffId

  throw new ValidationError(
    'Say which teacher took this register. Your own account is not linked to a staff record, ' +
      'so attendance cannot be recorded against you.',
    { markedByStaffId: ['Choose the teacher who took this register.'] },
  )
}

/* -------------------------------------------------------------------------- */
/* Changing a register                                                        */
/* -------------------------------------------------------------------------- */

interface LoadedSheet {
  id: string
  sectionId: string
  academicSessionId: string
  subjectId: string | null
  status: SheetStatus
  date: Date
  period: number
  markedByStaffId: string
  sectionName: string
}

async function loadSheet(sheetId: string): Promise<LoadedSheet> {
  const sheet = await prisma.attendanceSheet.findUnique({
    where: { id: sheetId },
    select: {
      id: true,
      sectionId: true,
      academicSessionId: true,
      subjectId: true,
      status: true,
      date: true,
      period: true,
      markedByStaffId: true,
      section: { select: { name: true } },
    },
  })
  if (!sheet) throw new NotFoundError('attendance sheet')
  return { ...sheet, sectionName: sheet.section.name }
}

/** Resolves the marking facts for an existing sheet, for an edit check. */
async function markingContextFor(ctx: AuthContext, sheet: LoadedSheet): Promise<MarkingContext> {
  let hasActiveAssignment = false
  let isActiveIncharge = false

  if (ctx.staffId) {
    if (sheet.subjectId) {
      hasActiveAssignment =
        (await prisma.teacherAssignment.findFirst({
          where: {
            staffId: ctx.staffId,
            sectionId: sheet.sectionId,
            subjectId: sheet.subjectId,
            isActive: true,
          },
          select: { id: true },
        })) !== null
    } else {
      isActiveIncharge =
        (await prisma.sectionIncharge.findFirst({
          where: { staffId: ctx.staffId, sectionId: sheet.sectionId, isActive: true },
          select: { id: true },
        })) !== null
    }
  }

  return { subjectId: sheet.subjectId, hasActiveAssignment, isActiveIncharge }
}

async function assertCanEdit(ctx: AuthContext, sheet: LoadedSheet): Promise<void> {
  const context = await markingContextFor(ctx, sheet)
  const decision = decideCanEditSheet(viewerOf(ctx), context, { status: sheet.status })
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sheetId: sheet.id,
    })
  }
}

/** Changes one student's mark, with a before/after audit entry. */
export async function updateAttendanceEntry(
  ctx: AuthContext,
  entryId: string,
  input: { status?: AttendanceStatus; remarks?: string },
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ id: string; status: AttendanceStatus; remarks: string | null }> {
  const entry = await prisma.attendanceEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      status: true,
      remarks: true,
      sheetId: true,
      student: { select: { studentCode: true } },
    },
  })
  if (!entry) throw new NotFoundError('attendance entry')

  const sheet = await loadSheet(entry.sheetId)
  await assertCanEdit(ctx, sheet)

  const nextStatus = input.status ?? entry.status
  const nextRemarks = input.remarks === undefined ? entry.remarks : (input.remarks || null)

  if (nextStatus === entry.status && nextRemarks === entry.remarks) {
    return { id: entry.id, status: entry.status, remarks: entry.remarks }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.attendanceEntry.update({
      where: { id: entry.id },
      data: { status: nextStatus, remarks: nextRemarks, updatedByUserId: ctx.userId },
      select: { id: true, status: true, remarks: true },
    })

    /**
     * Only a status change is worth an audit entry, and only the status is
     * recorded. A remark can hold anything a teacher typed — including why a
     * student was away — so it stays out of the audit trail.
     */
    if (nextStatus !== entry.status) {
      await writeAuditLog(
        ctx,
        {
          action: 'attendance.corrected',
          entityType: 'AttendanceEntry',
          entityId: entry.id,
          entityLabel: `${entry.student.studentCode} · ${sheet.sectionName} · ${storageToCollegeDate(sheet.date)}`,
          before: { status: entry.status },
          after: { status: nextStatus },
          metadata: { sheetId: sheet.id, sheetStatus: sheet.status },
          request,
        },
        tx,
      )
    }

    return updated
  })
}

/** Marks several students at once — what a teacher's screen will call. */
export async function markAttendance(
  ctx: AuthContext,
  sheetId: string,
  entries: Array<{ studentId: string; status: AttendanceStatus; remarks?: string }>,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<AttendanceSheetDetail> {
  const sheet = await loadSheet(sheetId)
  await assertCanEdit(ctx, sheet)

  const existing = await prisma.attendanceEntry.findMany({
    where: { sheetId },
    select: { id: true, studentId: true, status: true },
  })
  const byStudent = new Map(existing.map((e) => [e.studentId, e]))

  // Every id has to belong to this register. An unknown one is a mistake worth
  // reporting, not something to skip quietly.
  for (const entry of entries) {
    if (!byStudent.has(entry.studentId)) {
      throw new ValidationError('That list includes a student who is not on this register.')
    }
  }

  const changed = entries.filter((e) => byStudent.get(e.studentId)?.status !== e.status)

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const current = byStudent.get(entry.studentId)
      if (!current) continue
      await tx.attendanceEntry.update({
        where: { id: current.id },
        data: {
          status: entry.status,
          remarks: entry.remarks ?? null,
          updatedByUserId: ctx.userId,
        },
      })
    }

    if (changed.length > 0 && sheet.status === 'SUBMITTED') {
      // Corrections to a submitted register are the sensitive case, so they are
      // recorded as one entry naming how many marks moved.
      await writeAuditLog(
        ctx,
        {
          action: 'attendance.corrected',
          entityType: 'AttendanceSheet',
          entityId: sheet.id,
          entityLabel: `${sheet.sectionName} · ${storageToCollegeDate(sheet.date)} · period ${sheet.period}`,
          after: { correctedCount: changed.length },
          request,
        },
        tx,
      )
    }

    await tx.attendanceSheet.update({
      where: { id: sheet.id },
      data: { updatedByUserId: ctx.userId },
    })
  })

  return getAttendanceSheet(ctx, sheetId)
}

/* -------------------------------------------------------------------------- */
/* Submitting and cancelling                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Hands a register in. From here it counts towards every percentage, and a
 * teacher can no longer change it.
 */
export async function submitAttendanceSheet(
  ctx: AuthContext,
  sheetId: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<AttendanceSheetDetail> {
  const sheet = await loadSheet(sheetId)

  if (sheet.status === 'CANCELLED') {
    throw new ValidationError('This class was cancelled, so its attendance cannot be submitted.')
  }
  if (sheet.status === 'SUBMITTED') {
    throw new ConflictError('This attendance has already been submitted.')
  }

  await assertCanEdit(ctx, sheet)

  const [entries, roster] = await Promise.all([
    prisma.attendanceEntry.findMany({ where: { sheetId }, select: { studentId: true } }),
    loadRoster(sheet.sectionId, sheet.academicSessionId),
  ])

  if (entries.length === 0) {
    throw new ValidationError('This register has no students on it.')
  }

  /**
   * Everyone currently enrolled must have a mark. A student admitted into the
   * section after the register was opened would otherwise be silently missing
   * from the day's record.
   */
  const marked = new Set(entries.map((e) => e.studentId))
  const missing = roster.filter((student) => !marked.has(student.studentId))
  if (missing.length > 0) {
    throw new ValidationError(
      missing.length === 1
        ? `${missing[0]?.fullName} has joined this section and has no mark yet. Reopen the register to include them.`
        : `${missing.length} students have joined this section and have no mark yet. Reopen the register to include them.`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceSheet.update({
      where: { id: sheet.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), updatedByUserId: ctx.userId },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'attendance.submitted',
        entityType: 'AttendanceSheet',
        entityId: sheet.id,
        entityLabel: `${sheet.sectionName} · ${storageToCollegeDate(sheet.date)} · period ${sheet.period}`,
        after: { studentCount: entries.length },
        request,
      },
      tx,
    )
  })

  return getAttendanceSheet(ctx, sheetId)
}

/**
 * Marks a class as not having happened.
 *
 * Entries are kept. The sheet simply stops counting, and the reason is on record
 * so a gap in the register is explained rather than mysterious.
 */
export async function cancelAttendanceSheet(
  ctx: AuthContext,
  sheetId: string,
  cancelledReason: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<AttendanceSheetDetail> {
  const reason = cancelledReason.trim()
  if (reason.length < 3) {
    throw new ValidationError('Give a reason for cancelling.', {
      cancelledReason: ['Give a reason for cancelling.'],
    })
  }

  const sheet = await loadSheet(sheetId)
  const context = await markingContextFor(ctx, sheet)
  const decision = decideCanCancelSheet(viewerOf(ctx), context, { status: sheet.status })
  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      sheetId,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceSheet.update({
      where: { id: sheet.id },
      data: { status: 'CANCELLED', cancelledReason: reason, updatedByUserId: ctx.userId },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'attendance.sheet_cancelled',
        entityType: 'AttendanceSheet',
        entityId: sheet.id,
        entityLabel: `${sheet.sectionName} · ${storageToCollegeDate(sheet.date)} · period ${sheet.period}`,
        before: { status: sheet.status },
        after: { status: 'CANCELLED', cancelledReason: reason },
        request,
      },
      tx,
    )
  })

  return getAttendanceSheet(ctx, sheetId)
}

/* -------------------------------------------------------------------------- */
/* Reading registers                                                          */
/* -------------------------------------------------------------------------- */

const SHEET_SELECT = {
  id: true,
  date: true,
  period: true,
  status: true,
  sectionId: true,
  academicSessionId: true,
  subjectId: true,
  markedByStaffId: true,
  submittedAt: true,
  cancelledReason: true,
  subject: { select: { name: true } },
  markedBy: { select: { fullName: true } },
  section: {
    select: {
      name: true,
      academicGroup: {
        select: {
          class: { select: { name: true } },
          division: { select: { name: true } },
          program: { select: { name: true } },
        },
      },
    },
  },
  _count: { select: { entries: true } },
} as const

type SheetRow = Prisma.AttendanceSheetGetPayload<{ select: typeof SHEET_SELECT }>

function toListItem(row: SheetRow, counts: AttendanceCounts = { ...EMPTY_COUNTS }): AttendanceSheetListItem {
  return {
    id: row.id,
    date: storageToCollegeDate(row.date),
    period: row.period,
    status: row.status,
    sectionId: row.sectionId,
    sectionName: row.section.name,
    className: row.section.academicGroup.class.name,
    divisionName: row.section.academicGroup.division.name,
    programName: row.section.academicGroup.program.name,
    subjectId: row.subjectId,
    subjectName: row.subject?.name ?? null,
    markedByStaffId: row.markedByStaffId,
    markedByName: row.markedBy.fullName,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    studentCount: row._count.entries,
    counts,
  }
}

/**
 * How the marks fell, for a page of registers.
 *
 * One grouped query for the whole page rather than one per register — a list of
 * 25 sheets costs two queries in total, not twenty-six.
 */
async function countsForSheets(sheetIds: string[]): Promise<Map<string, AttendanceCounts>> {
  const byId = new Map<string, AttendanceCounts>()
  if (sheetIds.length === 0) return byId

  const groups = await prisma.attendanceEntry.groupBy({
    by: ['sheetId', 'status'],
    where: { sheetId: { in: sheetIds } },
    _count: { _all: true },
  })

  for (const group of groups) {
    const current = byId.get(group.sheetId) ?? { ...EMPTY_COUNTS }
    byId.set(
      group.sheetId,
      countsFromGroups([{ status: group.status, _count: group._count }], current),
    )
  }
  return byId
}

/**
 * Lists registers, filtered on the server.
 *
 * Deliberately returns sheet metadata only — never the entries. A month of
 * registers for a section is a few dozen rows; the same request with entries
 * attached would be thousands.
 */
export async function listAttendanceSheets(
  ctx: AuthContext,
  query: AttendanceSheetListQuery,
): Promise<PaginatedResult<AttendanceSheetListItem>> {
  authorize(ctx, 'attendance.view')

  const where: Prisma.AttendanceSheetWhereInput = {}

  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.subjectId) where.subjectId = query.subjectId
  if (query.staffId) where.markedByStaffId = query.staffId
  if (query.status) where.status = query.status
  if (query.kind === 'daily') where.subjectId = null
  if (query.kind === 'subject') where.subjectId = { not: null }

  if (query.date) {
    where.date = collegeDateToStorage(query.date)
  } else if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: collegeDateToStorage(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: collegeDateToStorage(query.dateTo) } : {}),
    }
  }

  /**
   * Staff see their own sections and nothing else. The filter is applied here,
   * on the server, on top of whatever the caller asked for — so narrowing by
   * `sectionId` can only ever reduce what a teacher sees, never widen it.
   */
  if (ctx.role !== 'ADMIN') {
    if (!ctx.staffId) {
      return paginatedResult([], 0, query.page, query.pageSize)
    }
    const [assignments, incharges] = await Promise.all([
      prisma.teacherAssignment.findMany({
        where: { staffId: ctx.staffId, isActive: true },
        select: { sectionId: true },
      }),
      prisma.sectionIncharge.findMany({
        where: { staffId: ctx.staffId, isActive: true },
        select: { sectionId: true },
      }),
    ])
    const allowed = [...new Set([...assignments, ...incharges].map((r) => r.sectionId))]
    if (allowed.length === 0) {
      return paginatedResult([], 0, query.page, query.pageSize)
    }
    where.sectionId = query.sectionId
      ? allowed.includes(query.sectionId)
        ? query.sectionId
        : '00000000-0000-0000-0000-000000000000'
      : { in: allowed }
  }

  const [rows, total] = await Promise.all([
    prisma.attendanceSheet.findMany({
      where,
      ...paginate(query.page, query.pageSize),
      orderBy: [{ date: 'desc' }, { period: 'asc' }],
      select: SHEET_SELECT,
    }),
    prisma.attendanceSheet.count({ where }),
  ])

  const counts = await countsForSheets(rows.map((r) => r.id))

  return paginatedResult(
    rows.map((row) => toListItem(row, counts.get(row.id))),
    total,
    query.page,
    query.pageSize,
  )
}

/** One register with its marks. */
export async function getAttendanceSheet(
  ctx: AuthContext,
  sheetId: string,
): Promise<AttendanceSheetDetail> {
  const row = await prisma.attendanceSheet.findUnique({
    where: { id: sheetId },
    select: SHEET_SELECT,
  })
  if (!row) throw new NotFoundError('attendance sheet')

  await assertCanViewSection(ctx, row.sectionId)

  const entries = await prisma.attendanceEntry.findMany({
    where: { sheetId },
    orderBy: [{ student: { fullName: 'asc' } }],
    select: {
      id: true,
      studentId: true,
      status: true,
      remarks: true,
      student: { select: { studentCode: true, fullName: true, fatherName: true } },
    },
  })

  // Roll numbers belong to the enrollment, not the student, so they are looked
  // up once for the whole register rather than per row.
  const rollNumbers = new Map(
    (
      await prisma.studentEnrollment.findMany({
        where: {
          sectionId: row.sectionId,
          academicSessionId: row.academicSessionId,
          studentId: { in: entries.map((e) => e.studentId) },
        },
        select: { studentId: true, rollNumber: true },
      })
    ).map((e) => [e.studentId, e.rollNumber]),
  )

  const counts = countStatuses(entries.map((e) => e.status))

  return {
    ...toListItem(row, counts),
    academicSessionId: row.academicSessionId,
    cancelledReason: row.cancelledReason,
    percentage: summarise(counts, { leaveCountsAsPresent: await leaveCountsAsPresent() }).percentage,
    entries: entries.map((entry) => ({
      id: entry.id,
      studentId: entry.studentId,
      studentCode: entry.student.studentCode,
      fullName: entry.student.fullName,
      fatherName: entry.student.fatherName,
      rollNumber: rollNumbers.get(entry.studentId) ?? null,
      status: entry.status,
      remarks: entry.remarks,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Percentages and summaries                                                  */
/* -------------------------------------------------------------------------- */

/** Reads the college's rule for how LEAVE affects a percentage. */
async function leaveCountsAsPresent(): Promise<boolean> {
  return (await readSetting<boolean>('attendance.leave_counts_as_present')) === true
}

/**
 * Only SUBMITTED sheets count. Applied as a relation filter so the database does
 * the work — nothing loads a student's individual marks to add them up.
 */
const COUNTED_SHEET: Prisma.AttendanceEntryWhereInput = {
  sheet: { status: COUNTED_SHEET_STATUS },
}

export interface StudentAttendanceSummary extends AttendanceSummary {
  studentId: string
  academicSessionId: string | null
}

/** A student's overall attendance, counted in the database. */
export async function getStudentAttendanceSummary(
  studentId: string,
  options: { academicSessionId?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<StudentAttendanceSummary> {
  const groups = await prisma.attendanceEntry.groupBy({
    by: ['status'],
    where: {
      studentId,
      ...COUNTED_SHEET,
      ...(options.academicSessionId ? { academicSessionId: options.academicSessionId } : {}),
      ...dateRangeFilter(options),
    },
    _count: { _all: true },
  })

  return {
    studentId,
    academicSessionId: options.academicSessionId ?? null,
    ...summarise(countsFromGroups(groups), {
      leaveCountsAsPresent: await leaveCountsAsPresent(),
    }),
  }
}

export interface SubjectAttendance extends AttendanceSummary {
  subjectId: string | null
  subjectName: string
}

/**
 * A student's attendance broken down by subject, with daily roll-call kept
 * separate rather than mixed into a subject's figures.
 *
 * Counted by the **database**, not in JavaScript. Prisma's `groupBy` cannot
 * group by a field on a related table, and a student accumulates a few thousand
 * entries a year, so this is one grouped SQL statement instead of loading every
 * row and tallying it in memory.
 */
export async function getStudentSubjectAttendance(
  studentId: string,
  options: { academicSessionId?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<SubjectAttendance[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      subject_id: string | null
      subject_name: string | null
      present: bigint
      absent: bigint
      late: bigint
      leave_count: bigint
    }>
  >`
    SELECT sh.subject_id,
           sub.name AS subject_name,
           COUNT(*) FILTER (WHERE e.status = 'PRESENT') AS present,
           COUNT(*) FILTER (WHERE e.status = 'ABSENT')  AS absent,
           COUNT(*) FILTER (WHERE e.status = 'LATE')    AS late,
           COUNT(*) FILTER (WHERE e.status = 'LEAVE')   AS leave_count
      FROM attendance_entries e
      JOIN attendance_sheets  sh ON sh.id = e.sheet_id
      LEFT JOIN subjects      sub ON sub.id = sh.subject_id
     WHERE e.student_id = ${studentId}::uuid
       AND sh.status = 'SUBMITTED'
       AND (${options.academicSessionId ?? null}::uuid IS NULL
            OR e.academic_session_id = ${options.academicSessionId ?? null}::uuid)
       AND (${options.dateFrom ?? null}::date IS NULL OR e.date >= ${options.dateFrom ?? null}::date)
       AND (${options.dateTo ?? null}::date IS NULL   OR e.date <= ${options.dateTo ?? null}::date)
     GROUP BY sh.subject_id, sub.name
     ORDER BY sub.name NULLS FIRST
  `

  const leaveAsPresent = await leaveCountsAsPresent()

  return rows.map((row) => ({
    subjectId: row.subject_id,
    subjectName: row.subject_name ?? 'Daily roll call',
    ...summarise(
      {
        present: Number(row.present),
        absent: Number(row.absent),
        late: Number(row.late),
        leave: Number(row.leave_count),
      },
      { leaveCountsAsPresent: leaveAsPresent },
    ),
  }))
}

export interface SectionAttendanceSummary extends AttendanceSummary {
  sectionId: string
  studentCount: number
  sheetCount: number
}

/** How a whole section is doing. Counted in the database, not in JavaScript. */
export async function getSectionAttendanceSummary(
  ctx: AuthContext,
  sectionId: string,
  options: { academicSessionId?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<SectionAttendanceSummary> {
  authorize(ctx, 'attendance.view')

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, academicSessionId: true },
  })
  if (!section) throw new NotFoundError('section')

  await assertCanViewSection(ctx, sectionId)

  const where: Prisma.AttendanceEntryWhereInput = {
    sheet: { status: COUNTED_SHEET_STATUS, sectionId },
    ...(options.academicSessionId ? { academicSessionId: options.academicSessionId } : {}),
    ...dateRangeFilter(options),
  }

  const [groups, sheetCount, studentCount] = await Promise.all([
    prisma.attendanceEntry.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.attendanceSheet.count({ where: { sectionId, status: COUNTED_SHEET_STATUS } }),
    prisma.studentEnrollment.count({
      where: { sectionId, academicSessionId: section.academicSessionId, status: 'ACTIVE' },
    }),
  ])

  return {
    sectionId,
    studentCount,
    sheetCount,
    ...summarise(countsFromGroups(groups), {
      leaveCountsAsPresent: await leaveCountsAsPresent(),
    }),
  }
}

function dateRangeFilter(options: { dateFrom?: string; dateTo?: string }): Prisma.AttendanceEntryWhereInput {
  if (!options.dateFrom && !options.dateTo) return {}
  return {
    date: {
      ...(options.dateFrom ? { gte: collegeDateToStorage(options.dateFrom) } : {}),
      ...(options.dateTo ? { lte: collegeDateToStorage(options.dateTo) } : {}),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* A student's own attendance                                                 */
/* -------------------------------------------------------------------------- */

export interface MyAttendanceQuery {
  academicSessionId?: string
  dateFrom?: string
  dateTo?: string
  /** A subject id, or the literal 'DAILY' for roll-call only. */
  subject?: string
  status?: AttendanceStatus
  page?: number
  pageSize?: number
}

export interface MyAttendance {
  /** Where the student currently sits. Null when they are not enrolled. */
  enrollment: {
    academicSessionId: string
    sessionName: string
    className: string
    divisionName: string
    programName: string
    sectionName: string
    rollNumber: string | null
  } | null
  overall: AttendanceSummary
  /** Subject lessons only. */
  bySubject: SubjectAttendance[]
  /** The section in-charge's roll-call, kept out of any subject's figures. */
  daily: SubjectAttendance | null
  history: PaginatedResult<{
    date: string
    period: number
    subjectId: string | null
    subjectName: string
    status: AttendanceStatus
  }>
  /** Only what actually appears in this student's history, for the filter. */
  subjectsInHistory: Array<{ id: string | null; name: string }>
}

/**
 * "My attendance".
 *
 * The student is resolved from the **authenticated session**. There is no
 * student id in this function's signature at all, so there is nothing for a URL
 * to override — a `?studentId=` on the request is simply not read.
 *
 * Summaries are counted by the database; the history is paginated. Nothing here
 * loads a student's whole attendance record into memory.
 */
export async function getMyAttendance(
  ctx: AuthContext,
  query: MyAttendanceQuery = {},
): Promise<MyAttendance> {
  authorize(ctx, 'attendance.view')

  if (!ctx.studentId) {
    throw new ForbiddenError('This account is not linked to a student record.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const studentId = ctx.studentId
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 25

  // Where the student sits now — used for the heading, and to default the
  // session so the page opens on the year they are actually in.
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
    select: {
      rollNumber: true,
      academicSessionId: true,
      section: {
        select: {
          name: true,
          academicGroup: {
            select: {
              academicSession: { select: { name: true } },
              class: { select: { name: true, displayName: true } },
              division: { select: { name: true } },
              program: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const range = { academicSessionId: query.academicSessionId, dateFrom: query.dateFrom, dateTo: query.dateTo }

  /**
   * Filters for the history list. `subject` accepts 'DAILY' so a student can
   * look at roll-call on its own without it being confused for a subject.
   */
  const historyWhere: Prisma.AttendanceEntryWhereInput = {
    studentId,
    ...COUNTED_SHEET,
    ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
    ...dateRangeFilter(query),
    ...(query.status ? { status: query.status } : {}),
    ...(query.subject === 'DAILY'
      ? { sheet: { status: COUNTED_SHEET_STATUS, subjectId: null } }
      : query.subject
        ? { sheet: { status: COUNTED_SHEET_STATUS, subjectId: query.subject } }
        : {}),
  }

  const [overall, breakdown, rows, total] = await Promise.all([
    getStudentAttendanceSummary(studentId, range),
    getStudentSubjectAttendance(studentId, range),
    prisma.attendanceEntry.findMany({
      where: historyWhere,
      orderBy: [{ date: 'desc' }],
      ...paginate(page, pageSize),
      select: {
        status: true,
        date: true,
        sheet: { select: { period: true, subjectId: true, subject: { select: { name: true } } } },
      },
    }),
    prisma.attendanceEntry.count({ where: historyWhere }),
  ])

  return {
    enrollment: enrollment
      ? {
          academicSessionId: enrollment.academicSessionId,
          sessionName: enrollment.section.academicGroup.academicSession.name,
          className:
            enrollment.section.academicGroup.class.displayName ??
            enrollment.section.academicGroup.class.name,
          divisionName: enrollment.section.academicGroup.division.name,
          programName: enrollment.section.academicGroup.program.name,
          sectionName: enrollment.section.name,
          rollNumber: enrollment.rollNumber,
        }
      : null,
    overall,
    bySubject: breakdown.filter((row) => row.subjectId !== null),
    daily: breakdown.find((row) => row.subjectId === null) ?? null,
    history: paginatedResult(
      rows.map((row) => ({
        date: storageToCollegeDate(row.date),
        period: row.sheet.period,
        subjectId: row.sheet.subjectId,
        subjectName: row.sheet.subject?.name ?? 'Daily roll call',
        status: row.status,
      })),
      total,
      page,
      pageSize,
    ),
    subjectsInHistory: breakdown.map((row) => ({ id: row.subjectId, name: row.subjectName })),
  }
}

export interface MarkingOption {
  /** Subject-wise, or the section in-charge's daily roll-call. */
  kind: 'subject' | 'daily'
  sectionId: string
  academicSessionId: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  subjectId: string | null
  subjectName: string | null
  studentCount: number
  /** Registers already opened for this option on the chosen date. */
  todaySheets: Array<{ id: string; period: number; status: SheetStatus }>
}

/**
 * Everything the signed-in teacher is allowed to mark, and what already exists
 * for the date in question.
 *
 * Built from the teacher's own ACTIVE records — `teacher_assignments` for
 * subjects, `section_incharges` for daily roll-call — resolved from
 * `ctx.staffId`, which comes from the session. A teacher cannot ask for
 * somebody else's options because there is no parameter for whose they are.
 *
 * This decides what the *screen offers*. It is not the security boundary:
 * `assertCanMarkAttendance` checks the same facts again when a register is
 * actually opened.
 */
export async function getMyMarkingOptions(
  ctx: AuthContext,
  date: string,
): Promise<MarkingOption[]> {
  authorize(ctx, 'attendance.view')

  if (ctx.role !== 'STAFF' || !ctx.staffId) {
    throw new ForbiddenError('The staff portal is only available to staff accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const staffId = ctx.staffId
  const on = collegeDateToStorage(date)

  const sectionSelect = {
    name: true,
    academicGroup: {
      select: {
        academicSession: { select: { id: true, name: true } },
        class: { select: { name: true, displayName: true } },
        division: { select: { name: true } },
        program: { select: { name: true } },
      },
    },
    _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
  }

  const [assignments, incharges] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: { staffId, isActive: true },
      orderBy: [{ assignedAt: 'desc' }],
      select: {
        sectionId: true,
        academicSessionId: true,
        subject: { select: { id: true, name: true } },
        section: { select: sectionSelect },
      },
    }),
    prisma.sectionIncharge.findMany({
      where: { staffId, isActive: true },
      orderBy: [{ assignedAt: 'desc' }],
      select: {
        sectionId: true,
        academicSessionId: true,
        section: { select: sectionSelect },
      },
    }),
  ])

  // One query for every register this teacher could already have opened today,
  // rather than one per option.
  const sectionIds = [
    ...new Set([...assignments.map((a) => a.sectionId), ...incharges.map((i) => i.sectionId)]),
  ]
  const existing =
    sectionIds.length === 0
      ? []
      : await prisma.attendanceSheet.findMany({
          where: { sectionId: { in: sectionIds }, date: on },
          orderBy: [{ period: 'asc' }],
          select: { id: true, sectionId: true, subjectId: true, period: true, status: true },
        })

  const sheetsFor = (sectionId: string, subjectId: string | null) =>
    existing
      .filter((sheet) => sheet.sectionId === sectionId && sheet.subjectId === subjectId)
      .map((sheet) => ({ id: sheet.id, period: sheet.period, status: sheet.status }))

  const describe = (section: {
    name: string
    academicGroup: {
      academicSession: { id: string; name: string }
      class: { name: string; displayName: string | null }
      division: { name: string }
      program: { name: string }
    }
    _count: { enrollments: number }
  }) => ({
    sessionName: section.academicGroup.academicSession.name,
    className: section.academicGroup.class.displayName ?? section.academicGroup.class.name,
    divisionName: section.academicGroup.division.name,
    programName: section.academicGroup.program.name,
    sectionName: section.name,
    studentCount: section._count.enrollments,
  })

  const options: MarkingOption[] = [
    ...assignments.map((assignment) => ({
      kind: 'subject' as const,
      sectionId: assignment.sectionId,
      academicSessionId: assignment.academicSessionId,
      subjectId: assignment.subject.id,
      subjectName: assignment.subject.name,
      ...describe(assignment.section),
      todaySheets: sheetsFor(assignment.sectionId, assignment.subject.id),
    })),
    ...incharges.map((incharge) => ({
      kind: 'daily' as const,
      sectionId: incharge.sectionId,
      academicSessionId: incharge.academicSessionId,
      subjectId: null,
      subjectName: null,
      ...describe(incharge.section),
      todaySheets: sheetsFor(incharge.sectionId, null),
    })),
  ]

  return options
}

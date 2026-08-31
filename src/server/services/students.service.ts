/**
 * Student records and their academic enrollment.
 *
 * The shape of the data (ADR-032): a student row holds the person; a
 * `student_enrollments` row holds where they sit in one academic session. The
 * enrollment points at a SECTION, and the section already knows its academic
 * group — which is session × class × division × program. So the whole chain
 *
 *     Session → Class → Division → Program → Section → Student
 *
 * is expressed by a single `sectionId`, and nothing about "Pre-Medical" or
 * "Boys" appears anywhere in this file.
 *
 * History is never overwritten. Moving a student closes the old enrollment row
 * and opens a new one, so every placement they have ever had stays queryable.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, NotFoundError, ValidationError } from '../api/errors'
import { generateTemporaryPassword, hashPassword } from '../auth/password'
import { nextCode } from './code-sequence'
import { paginate, paginatedResult, withUniqueConstraintHandling, type PaginatedResult, assertAdminArea as assertAdminAreaFor } from './service-utils'
import type {
  EnrollmentSelection,
  StudentAccountInput,
  StudentCreateInput,
  StudentListQuery,
  StudentPromoteInput,
  StudentTransferInput,
  StudentUpdateInput,
} from '@/validation/students'
import type { Prisma } from '@/generated/prisma/client'
import type { StudentStatus } from '@/generated/prisma/enums'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface PlacementView {
  enrollmentId: string
  status: string
  rollNumber: string | null
  startDate: Date
  endDate: Date | null
  sessionId: string
  sessionName: string
  classId: string
  className: string
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  sectionId: string
  sectionName: string
}

export interface StudentListItem {
  id: string
  studentCode: string
  admissionNumber: string
  fullName: string
  fatherName: string
  status: StudentStatus
  admissionDate: Date
  /** Their placement in the session being viewed, if they have one. */
  placement: PlacementView | null
  account: { userId: string; username: string; isActive: boolean } | null
}

export interface StudentDetail extends StudentListItem {
  dateOfBirth: Date | null
  gender: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  cnicBformNumber: string | null
  fatherCnic: string | null
  fatherPhone: string | null
  fatherOccupation: string | null
  motherName: string | null
  guardianName: string | null
  guardianRelation: string | null
  guardianPhone: string | null
  previousInstitution: string | null
  previousResultSummary: string | null
  previousResultObtained: number | null
  previousResultTotal: number | null
  matricRollNumber: string | null
  matricBoard: string | null
  notes: string | null
  admissionSessionName: string
  createdAt: Date
  /** Every placement the student has ever had, newest first. */
  history: PlacementView[]
  /** Subjects for their current class + program, from the curriculum. */
  currentSubjects: { id: string; name: string; code: string | null }[]
}

/* -------------------------------------------------------------------------- */
/* Shared query pieces                                                        */
/* -------------------------------------------------------------------------- */

/** Everything needed to describe where an enrollment sits. */
const enrollmentInclude = {
  section: {
    include: {
      academicGroup: {
        include: {
          // startDate/endDate are needed when promoting, to confirm the target
          // session really comes after the one being closed.
          academicSession: { select: { id: true, name: true, startDate: true, endDate: true } },
          class: { select: { id: true, name: true, displayName: true } },
          division: { select: { id: true, name: true } },
          program: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const

type EnrollmentWithPlace = Prisma.StudentEnrollmentGetPayload<{ include: typeof enrollmentInclude }>

function toPlacement(enrollment: EnrollmentWithPlace): PlacementView {
  const group = enrollment.section.academicGroup
  return {
    enrollmentId: enrollment.id,
    status: enrollment.status,
    rollNumber: enrollment.rollNumber,
    startDate: enrollment.startDate,
    endDate: enrollment.endDate,
    sessionId: group.academicSession.id,
    sessionName: group.academicSession.name,
    classId: group.class.id,
    className: group.class.displayName ?? group.class.name,
    divisionId: group.division.id,
    divisionName: group.division.name,
    programId: group.program.id,
    programName: group.program.name,
    sectionId: enrollment.section.id,
    sectionName: enrollment.section.name,
  }
}

/**
 * Student Management is an administrator area.
 *
 * `students.view` is held by the STAFF role too, because a teacher will
 * eventually see the students in the sections they teach. That view is
 * deliberately different: it is limited to their own sections and shows a
 * reduced set of fields — no CNIC, no address, no guardian details.
 *
 * That scoping needs teacher assignments, which arrive in Phase 5. Until then
 * these endpoints require the ADMIN role, so holding `students.view` alone can
 * never expose the full record of every student in the college.
 */
const assertAdminArea = (ctx: AuthContext) => assertAdminAreaFor(ctx, 'Student management')

/**
 * Checks that the section the administrator chose really belongs to the class,
 * division, program and session they selected in the form.
 *
 * The browser sends all five ids; only the section is stored. Verifying them
 * against each other means a tampered or stale request cannot place a student
 * somewhere that was never chosen.
 */
async function resolveSection(selection: EnrollmentSelection) {
  const section = await prisma.section.findUnique({
    where: { id: selection.sectionId },
    include: { academicGroup: { include: { class: true, division: true, program: true, academicSession: true } } },
  })

  if (!section) throw new NotFoundError('section')

  const group = section.academicGroup
  const mismatch =
    group.academicSessionId !== selection.academicSessionId ||
    group.classId !== selection.classId ||
    group.divisionId !== selection.divisionId ||
    group.programId !== selection.programId

  if (mismatch) {
    throw new ValidationError(
      'That section does not belong to the class, division and program you selected. Please choose again.',
      { sectionId: ['This combination does not exist in the academic structure.'] },
    )
  }

  if (!section.isActive || !group.isActive) {
    throw new ConflictError(
      `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name} is deactivated, so students cannot be enrolled into it.`,
    )
  }

  return section
}

/**
 * Messages for the database constraints that a placement can violate.
 *
 * The keys are matched against the name of the index Postgres reports, which is
 * why those indexes are named after their columns.
 */
function placementConflictMessages(rollNumber: string | undefined, sectionLabel: string) {
  const rollMessage = `Roll number ${rollNumber} is already used by another student in ${sectionLabel}.`
  return {
    roll_number: rollMessage,
    section_id: rollMessage,
    academic_session_id: 'This student already has an active enrollment in that academic session.',
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listStudents(
  ctx: AuthContext,
  query: StudentListQuery,
): Promise<PaginatedResult<StudentListItem> & { counts: Record<string, number>; sessionId: string | null }> {
  authorize(ctx, 'students.view')
  assertAdminArea(ctx)

  // Default to the session the college is currently working in.
  const sessionId =
    query.sessionId ??
    (await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id ??
    null

  /**
   * Academic filters apply to the student's ACTIVE enrollment in the chosen
   * session. Everything is matched by id, so a newly created program or section
   * filters correctly with no code change.
   */
  const academicFilter =
    sessionId &&
    (query.classId || query.divisionId || query.programId || query.sectionId)
      ? {
          enrollments: {
            some: {
              academicSessionId: sessionId,
              status: 'ACTIVE' as const,
              ...(query.sectionId ? { sectionId: query.sectionId } : {}),
              ...(query.classId || query.divisionId || query.programId
                ? {
                    section: {
                      academicGroup: {
                        ...(query.classId ? { classId: query.classId } : {}),
                        ...(query.divisionId ? { divisionId: query.divisionId } : {}),
                        ...(query.programId ? { programId: query.programId } : {}),
                      },
                    },
                  }
                : {}),
            },
          },
        }
      : {}

  const searchFilter = query.search
    ? {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' as const } },
          { studentCode: { contains: query.search, mode: 'insensitive' as const } },
          { admissionNumber: { contains: query.search, mode: 'insensitive' as const } },
          { fatherName: { contains: query.search, mode: 'insensitive' as const } },
          {
            enrollments: {
              some: {
                rollNumber: { contains: query.search, mode: 'insensitive' as const },
                ...(sessionId ? { academicSessionId: sessionId } : {}),
              },
            },
          },
        ],
      }
    : {}

  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(query.status !== 'ALL' ? { status: query.status } : {}),
    ...academicFilter,
    ...searchFilter,
  }

  // Sorting is limited to a fixed list — the client cannot order by any column.
  const orderBy: Prisma.StudentOrderByWithRelationInput =
    query.sort === 'studentCode'
      ? { studentCode: query.direction }
      : query.sort === 'admissionNumber'
        ? { admissionNumber: query.direction }
        : query.sort === 'admissionDate'
          ? { admissionDate: query.direction }
          : query.sort === 'createdAt'
            ? { createdAt: query.direction }
            : { fullName: query.direction }

  const [rows, total, statusCounts] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy,
      ...paginate(query.page, query.pageSize),
      include: {
        user: { select: { id: true, username: true, status: true } },
        enrollments: {
          where: sessionId ? { academicSessionId: sessionId, status: 'ACTIVE' } : { status: 'ACTIVE' },
          orderBy: { startDate: 'desc' },
          take: 1,
          include: enrollmentInclude,
        },
      },
    }),
    prisma.student.count({ where }),
    prisma.student.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ])

  const counts: Record<string, number> = {}
  let allCount = 0
  for (const row of statusCounts) {
    counts[row.status] = row._count._all
    allCount += row._count._all
  }
  counts.ALL = allCount

  const items: StudentListItem[] = rows.map((student) => ({
    id: student.id,
    studentCode: student.studentCode,
    admissionNumber: student.admissionNumber,
    fullName: student.fullName,
    fatherName: student.fatherName,
    status: student.status,
    admissionDate: student.admissionDate,
    placement: student.enrollments[0] ? toPlacement(student.enrollments[0]) : null,
    account: student.user
      ? { userId: student.user.id, username: student.user.username, isActive: student.user.status === 'ACTIVE' }
      : null,
  }))

  return { ...paginatedResult(items, total, query.page, query.pageSize), counts, sessionId }
}

export async function getStudent(ctx: AuthContext, id: string): Promise<StudentDetail> {
  authorize(ctx, 'students.view')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, username: true, status: true } },
      admissionSession: { select: { name: true } },
      enrollments: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], include: enrollmentInclude },
    },
  })

  if (!student) throw new NotFoundError('student')

  const history = student.enrollments.map(toPlacement)
  const current = history.find((h) => h.status === 'ACTIVE') ?? null

  /**
   * The subjects this student studies come from the curriculum for their class
   * and program — never from a list stored on the student. If the curriculum
   * has not been set up yet this is simply empty, which the profile says
   * plainly rather than inventing subjects.
   */
  const currentSubjects = current
    ? (
        await prisma.curriculumSubject.findMany({
          where: {
            academicSessionId: current.sessionId,
            classId: current.classId,
            programId: current.programId,
          },
          orderBy: [{ sortOrder: 'asc' }, { subject: { name: 'asc' } }],
          include: { subject: { select: { id: true, name: true, code: true } } },
        })
      ).map((entry) => entry.subject)
    : []

  return {
    id: student.id,
    studentCode: student.studentCode,
    admissionNumber: student.admissionNumber,
    fullName: student.fullName,
    fatherName: student.fatherName,
    status: student.status,
    admissionDate: student.admissionDate,
    placement: current,
    account: student.user
      ? { userId: student.user.id, username: student.user.username, isActive: student.user.status === 'ACTIVE' }
      : null,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    phone: student.phone,
    email: student.email,
    address: student.address,
    city: student.city,
    cnicBformNumber: student.cnicBformNumber,
    fatherCnic: student.fatherCnic,
    fatherPhone: student.fatherPhone,
    fatherOccupation: student.fatherOccupation,
    motherName: student.motherName,
    guardianName: student.guardianName,
    guardianRelation: student.guardianRelation,
    guardianPhone: student.guardianPhone,
    previousInstitution: student.previousInstitution,
    previousResultSummary: student.previousResultSummary,
    previousResultObtained: student.previousResultObtained,
    previousResultTotal: student.previousResultTotal,
    matricRollNumber: student.matricRollNumber,
    matricBoard: student.matricBoard,
    notes: student.notes,
    admissionSessionName: student.admissionSession.name,
    createdAt: student.createdAt,
    history,
    currentSubjects,
  }
}

/* -------------------------------------------------------------------------- */
/* Creating                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateStudentResult {
  student: StudentListItem
  /** Present only when a portal account was created at the same time. */
  account?: { username: string; temporaryPassword: string }
}

/** Maps form fields to database columns, converting dates. */
function toStudentData(input: StudentCreateInput | StudentUpdateInput) {
  return {
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    gender: input.gender ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    cnicBformNumber: input.cnicBformNumber ?? null,
    fatherName: input.fatherName,
    fatherCnic: input.fatherCnic ?? null,
    fatherPhone: input.fatherPhone ?? null,
    fatherOccupation: input.fatherOccupation ?? null,
    motherName: input.motherName ?? null,
    guardianName: input.guardianName ?? null,
    guardianRelation: input.guardianRelation ?? null,
    guardianPhone: input.guardianPhone ?? null,
    previousInstitution: input.previousInstitution ?? null,
    previousResultSummary: input.previousResultSummary ?? null,
    previousResultObtained: input.previousResultObtained ?? null,
    previousResultTotal: input.previousResultTotal ?? null,
    matricRollNumber: input.matricRollNumber ?? null,
    matricBoard: input.matricBoard ?? null,
    notes: input.notes ?? null,
  }
}

/**
 * Admits a student: creates the record, their first enrollment, and optionally
 * a portal login — all in one transaction, so a failure anywhere leaves nothing
 * half-created.
 */
export async function createStudent(
  ctx: AuthContext,
  input: StudentCreateInput,
): Promise<CreateStudentResult> {
  authorize(ctx, 'students.create')
  authorize(ctx, 'students.enroll')
  assertAdminArea(ctx)

  const section = await resolveSection(input.enrollment)
  const group = section.academicGroup
  const sectionLabel = `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name}`

  // A supplied admission number must be free before we start.
  if (input.admissionNumber) {
    const clash = await prisma.student.findUnique({
      where: { admissionNumber: input.admissionNumber },
      select: { id: true },
    })
    if (clash) {
      throw new ConflictError('That admission number is already used by another student.', {
        admissionNumber: ['This admission number already exists.'],
      })
    }
  }

  let accountResult: { username: string; temporaryPassword: string } | undefined

  if (input.createAccount) {
    if (!input.username) {
      throw new ValidationError('Enter a username for the portal account.', {
        username: ['A username is required to create an account.'],
      })
    }
    const taken = await prisma.user.findFirst({
      where: { username: { equals: input.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (taken) {
      throw new ConflictError('That username is already taken.', {
        username: ['That username is already taken.'],
      })
    }
  }

  const studentId = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        // Codes come from the shared counter, never from the browser.
        const studentCode = await nextCode('STUDENT', tx)
        const admissionNumber = input.admissionNumber ?? (await nextCode('ADMISSION', tx))

        let userId: string | null = null
        if (input.createAccount && input.username) {
          const temporaryPassword = generateTemporaryPassword()
          const user = await tx.user.create({
            data: {
              username: input.username,
              fullName: input.fullName,
              email: input.email ?? null,
              passwordHash: await hashPassword(temporaryPassword),
              role: 'STUDENT',
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          })
          userId = user.id
          accountResult = { username: user.username, temporaryPassword }

          await writeAuditLog(
            ctx,
            {
              action: 'user.created',
              entityType: 'user',
              entityId: user.id,
              entityLabel: `${input.fullName} (${user.username})`,
              // No password material of any kind.
              after: { username: user.username, role: 'STUDENT', status: 'ACTIVE' },
              metadata: { createdWithStudent: true },
            },
            tx,
          )
        }

        const student = await tx.student.create({
          data: {
            ...toStudentData(input),
            studentCode,
            admissionNumber,
            admissionDate: new Date(input.admissionDate),
            admissionSessionId: input.enrollment.academicSessionId,
            status: 'ACTIVE',
            userId,
          },
        })

        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            academicSessionId: input.enrollment.academicSessionId,
            sectionId: section.id,
            rollNumber: input.enrollment.rollNumber ?? null,
            status: 'ACTIVE',
            startDate: new Date(input.admissionDate),
            createdByUserId: ctx.userId,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: 'student.created',
            entityType: 'student',
            entityId: student.id,
            entityLabel: `${student.studentCode} ${student.fullName}`,
            after: {
              studentCode: student.studentCode,
              admissionNumber: student.admissionNumber,
              fullName: student.fullName,
              fatherName: student.fatherName,
            },
            metadata: { accountCreated: Boolean(userId) },
          },
          tx,
        )

        await writeAuditLog(
          ctx,
          {
            action: 'enrollment.created',
            entityType: 'student_enrollment',
            entityId: student.id,
            entityLabel: `${student.studentCode} ${student.fullName}`,
            after: { placement: sectionLabel, rollNumber: input.enrollment.rollNumber ?? null },
          },
          tx,
        )

        return student.id
      }),
    {
      admission_number: 'That admission number is already used by another student.',
      student_code: 'That student ID is already in use — please try again.',
      cnic_bform_number: 'That CNIC / B-Form number is already recorded for another student.',
      username: 'That username is already taken.',
      ...placementConflictMessages(input.enrollment.rollNumber, sectionLabel),
    },
  )

  const student = await getStudent(ctx, studentId)
  return {
    student,
    ...(accountResult ? { account: accountResult } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateStudent(
  ctx: AuthContext,
  id: string,
  input: StudentUpdateInput,
): Promise<StudentDetail> {
  authorize(ctx, 'students.update')
  assertAdminArea(ctx)

  const before = await prisma.student.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw new NotFoundError('student')

  await withUniqueConstraintHandling(
    () =>
      prisma.student.update({
        where: { id },
        data: {
          ...toStudentData(input),
          admissionNumber: input.admissionNumber,
          admissionDate: new Date(input.admissionDate),
        },
      }),
    {
      admission_number: 'That admission number is already used by another student.',
      cnic_bform_number: 'That CNIC / B-Form number is already recorded for another student.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'student.updated',
    entityType: 'student',
    entityId: id,
    entityLabel: `${before.studentCode} ${input.fullName}`,
    before: { fullName: before.fullName, admissionNumber: before.admissionNumber, fatherName: before.fatherName },
    after: { fullName: input.fullName, admissionNumber: input.admissionNumber, fatherName: input.fatherName },
  })

  return getStudent(ctx, id)
}

/**
 * Changes the student's lifecycle status.
 *
 * Records are never deleted: a student who leaves keeps every enrollment,
 * and later their attendance and results too. Moving them out of ACTIVE also
 * closes their current enrollment so their roll number is released and they
 * stop appearing in class lists.
 */
export async function setStudentStatus(
  ctx: AuthContext,
  id: string,
  status: StudentStatus,
  reason?: string,
): Promise<StudentDetail> {
  authorize(ctx, 'students.update')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } })
  if (!student) throw new NotFoundError('student')
  if (student.status === status) return getStudent(ctx, id)

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id }, data: { status } })

    if (status !== 'ACTIVE') {
      const closingStatus =
        status === 'GRADUATED' ? 'COMPLETED' : status === 'TRANSFERRED_OUT' ? 'TRANSFERRED' : 'LEFT'

      const closed = await tx.studentEnrollment.updateMany({
        where: { studentId: id, status: 'ACTIVE' },
        data: { status: closingStatus, endDate: new Date() },
      })

      if (closed.count > 0) {
        await writeAuditLog(
          ctx,
          {
            action: 'enrollment.closed',
            entityType: 'student_enrollment',
            entityId: id,
            entityLabel: `${student.studentCode} ${student.fullName}`,
            after: { closedAs: closingStatus },
            metadata: { reason: reason ?? null },
          },
          tx,
        )
      }
    }

    await writeAuditLog(
      ctx,
      {
        action: 'student.status_changed',
        entityType: 'student',
        entityId: id,
        entityLabel: `${student.studentCode} ${student.fullName}`,
        before: { status: student.status },
        after: { status },
        metadata: { reason: reason ?? null },
      },
      tx,
    )
  })

  return getStudent(ctx, id)
}

/* -------------------------------------------------------------------------- */
/* Moving a student                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Moves a student to a different section, program or division WITHIN the same
 * academic session.
 *
 * The old enrollment is closed as TRANSFERRED rather than edited, and a new one
 * is opened. Both rows stay in the student's history, and any attendance or
 * marks already recorded remain attached to the section where they happened.
 */
export async function transferStudent(
  ctx: AuthContext,
  id: string,
  input: StudentTransferInput,
): Promise<StudentDetail> {
  authorize(ctx, 'students.enroll')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } })
  if (!student) throw new NotFoundError('student')

  const section = await resolveSection(input.enrollment)
  const group = section.academicGroup
  const sectionLabel = `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name}`

  const current = await prisma.studentEnrollment.findFirst({
    where: { studentId: id, status: 'ACTIVE' },
    include: enrollmentInclude,
  })

  if (current && current.academicSessionId !== input.enrollment.academicSessionId) {
    throw new ConflictError(
      'A transfer moves a student inside the same academic session. To move them into a different session, use Promote.',
    )
  }

  if (current && current.sectionId === section.id && (current.rollNumber ?? null) === (input.enrollment.rollNumber ?? null)) {
    throw new ConflictError('The student is already in that section with that roll number.')
  }

  const previous = current ? toPlacement(current) : null

  await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        if (current) {
          await tx.studentEnrollment.update({
            where: { id: current.id },
            data: { status: 'TRANSFERRED', endDate: new Date() },
          })
        }

        await tx.studentEnrollment.create({
          data: {
            studentId: id,
            academicSessionId: input.enrollment.academicSessionId,
            sectionId: section.id,
            rollNumber: input.enrollment.rollNumber ?? null,
            status: 'ACTIVE',
            startDate: new Date(),
            createdByUserId: ctx.userId,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: 'enrollment.transferred',
            entityType: 'student_enrollment',
            entityId: id,
            entityLabel: `${student.studentCode} ${student.fullName}`,
            before: previous
              ? {
                  placement: `${previous.className} · ${previous.divisionName} · ${previous.programName} · Section ${previous.sectionName}`,
                  rollNumber: previous.rollNumber,
                }
              : undefined,
            after: { placement: sectionLabel, rollNumber: input.enrollment.rollNumber ?? null },
            metadata: { reason: input.reason ?? null, previousEnrollmentKept: Boolean(current) },
          },
          tx,
        )
      }),
    {
      ...placementConflictMessages(input.enrollment.rollNumber, sectionLabel),
    },
  )

  return getStudent(ctx, id)
}

/**
 * Moves a student into a LATER academic session — the new academic year.
 *
 * This is always an explicit action: nothing is promoted automatically just
 * because a new session exists. The previous year's enrollment is closed with
 * the outcome (promoted, repeated or completed) and a new ACTIVE enrollment is
 * created, so the student's year-by-year history builds up.
 */
export async function promoteStudent(
  ctx: AuthContext,
  id: string,
  input: StudentPromoteInput,
): Promise<StudentDetail> {
  authorize(ctx, 'students.promote')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } })
  if (!student) throw new NotFoundError('student')

  if (student.status !== 'ACTIVE') {
    throw new ConflictError(
      `${student.fullName} is not an active student, so they cannot be promoted. Change their status to Active first.`,
    )
  }

  const section = await resolveSection(input.enrollment)
  const group = section.academicGroup
  const sectionLabel = `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name}`

  const current = await prisma.studentEnrollment.findFirst({
    where: { studentId: id, status: 'ACTIVE' },
    include: enrollmentInclude,
  })

  if (!current) {
    throw new ConflictError(
      'This student has no current enrollment to promote from. Enrol them first.',
    )
  }

  if (current.academicSessionId === input.enrollment.academicSessionId) {
    throw new ConflictError(
      'Promotion moves a student into a different academic session. To change their section within this session, use Transfer.',
    )
  }

  const targetSession = group.academicSession
  const sourceSession = current.section.academicGroup.academicSession
  if (targetSession.startDate <= sourceSession.startDate) {
    throw new ConflictError(
      `${targetSession.name} does not come after ${sourceSession.name}. Choose a later academic session.`,
    )
  }

  const previous = toPlacement(current)

  await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.studentEnrollment.update({
          where: { id: current.id },
          data: { status: input.outcome, endDate: sourceSession.endDate },
        })

        await tx.studentEnrollment.create({
          data: {
            studentId: id,
            academicSessionId: input.enrollment.academicSessionId,
            sectionId: section.id,
            rollNumber: input.enrollment.rollNumber ?? null,
            status: 'ACTIVE',
            startDate: targetSession.startDate,
            createdByUserId: ctx.userId,
          },
        })

        // Finishing the final year is recorded on the student too.
        if (input.outcome === 'COMPLETED') {
          await tx.student.update({ where: { id }, data: { status: 'GRADUATED' } })
        }

        await writeAuditLog(
          ctx,
          {
            action: 'enrollment.promoted',
            entityType: 'student_enrollment',
            entityId: id,
            entityLabel: `${student.studentCode} ${student.fullName}`,
            before: {
              session: previous.sessionName,
              placement: `${previous.className} · ${previous.divisionName} · ${previous.programName} · Section ${previous.sectionName}`,
              closedAs: input.outcome,
            },
            after: { session: targetSession.name, placement: sectionLabel, rollNumber: input.enrollment.rollNumber ?? null },
            metadata: { reason: input.reason ?? null },
          },
          tx,
        )
      }),
    {
      ...placementConflictMessages(input.enrollment.rollNumber, sectionLabel),
    },
  )

  return getStudent(ctx, id)
}

/* -------------------------------------------------------------------------- */
/* Portal account                                                             */
/* -------------------------------------------------------------------------- */

export interface LinkAccountResult {
  student: StudentDetail
  account?: { username: string; temporaryPassword: string }
}

/**
 * Connects a student record to a student portal login — either an existing
 * account or a brand-new one.
 *
 * Authentication itself is untouched: the account is an ordinary `users` row
 * created by the same code as everywhere else, and nothing about passwords is
 * stored on the student.
 */
export async function linkStudentAccount(
  ctx: AuthContext,
  id: string,
  input: StudentAccountInput,
): Promise<LinkAccountResult> {
  authorize(ctx, 'students.update')
  authorize(ctx, 'users.manage')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } })
  if (!student) throw new NotFoundError('student')

  if (student.userId) {
    throw new ConflictError(
      `${student.fullName} already has a portal account. Unlink it before linking a different one.`,
    )
  }

  let accountResult: { username: string; temporaryPassword: string } | undefined

  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { student: { select: { id: true } }, staff: { select: { id: true } } },
    })
    if (!user) throw new NotFoundError('user account')
    if (user.role !== 'STUDENT') {
      throw new ConflictError('Only an account with the Student role can be linked to a student record.')
    }
    if (user.student || user.staff) {
      throw new ConflictError('That account is already linked to another record.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { userId: user.id } })
      await writeAuditLog(
        ctx,
        {
          action: 'student.account_linked',
          entityType: 'student',
          entityId: id,
          entityLabel: `${student.studentCode} ${student.fullName}`,
          after: { username: user.username },
          metadata: { existingAccount: true },
        },
        tx,
      )
    })
  } else if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: { equals: input.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (taken) {
      throw new ConflictError('That username is already taken.', {
        username: ['That username is already taken.'],
      })
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)

    await withUniqueConstraintHandling(
      () =>
        prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              username: input.username!,
              fullName: student.fullName,
              email: student.email,
              passwordHash,
              role: 'STUDENT',
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          })

          await tx.student.update({ where: { id }, data: { userId: user.id } })

          await writeAuditLog(
            ctx,
            {
              action: 'user.created',
              entityType: 'user',
              entityId: user.id,
              entityLabel: `${student.fullName} (${user.username})`,
              after: { username: user.username, role: 'STUDENT', status: 'ACTIVE' },
              metadata: { createdForStudent: student.studentCode },
            },
            tx,
          )

          await writeAuditLog(
            ctx,
            {
              action: 'student.account_linked',
              entityType: 'student',
              entityId: id,
              entityLabel: `${student.studentCode} ${student.fullName}`,
              after: { username: user.username },
              metadata: { existingAccount: false },
            },
            tx,
          )

          accountResult = { username: user.username, temporaryPassword }
        }),
      { username: 'That username is already taken.' },
    )
  }

  return {
    student: await getStudent(ctx, id),
    ...(accountResult ? { account: accountResult } : {}),
  }
}

/**
 * Disconnects the login from the student record.
 *
 * The user account itself is left alone — it is deactivated or kept from User
 * Management, which is where account lifecycle belongs. Unlinking only removes
 * the connection, so no sign-in history or audit trail is lost.
 */
export async function unlinkStudentAccount(ctx: AuthContext, id: string): Promise<StudentDetail> {
  authorize(ctx, 'students.update')
  authorize(ctx, 'users.manage')
  assertAdminArea(ctx)

  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    include: { user: { select: { id: true, username: true } } },
  })
  if (!student) throw new NotFoundError('student')
  if (!student.userId || !student.user) {
    throw new ConflictError('This student does not have a portal account linked.')
  }

  const username = student.user.username

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id }, data: { userId: null } })
    await writeAuditLog(
      ctx,
      {
        action: 'student.account_unlinked',
        entityType: 'student',
        entityId: id,
        entityLabel: `${student.studentCode} ${student.fullName}`,
        before: { username },
        metadata: { accountKept: true },
      },
      tx,
    )
  })

  return getStudent(ctx, id)
}

/* -------------------------------------------------------------------------- */
/* Options for the enrollment form                                            */
/* -------------------------------------------------------------------------- */

export interface EnrollmentOptionGroup {
  academicGroupId: string
  classId: string
  className: string
  classLevel: number
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  sections: { id: string; name: string; capacity: number | null; studentCount: number }[]
}

/**
 * Every Class × Division × Program combination that exists in a session, with
 * its sections — the raw material for the cascading dropdowns.
 *
 * Sent as one list so the form can narrow the choices as the administrator
 * picks, without a request per dropdown. Because it is read from the database,
 * a program created five minutes ago is already here.
 */
export async function getEnrollmentOptions(
  ctx: AuthContext,
  academicSessionId: string,
): Promise<EnrollmentOptionGroup[]> {
  authorize(ctx, 'students.view')
  assertAdminArea(ctx)

  const groups = await prisma.academicGroup.findMany({
    where: { academicSessionId, isActive: true },
    include: {
      class: { select: { id: true, name: true, displayName: true, level: true } },
      division: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      sections: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: { _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } },
      },
    },
    orderBy: [
      { class: { level: 'asc' } },
      { division: { sortOrder: 'asc' } },
      { program: { sortOrder: 'asc' } },
    ],
  })

  return groups.map((group) => ({
    academicGroupId: group.id,
    classId: group.classId,
    className: group.class.displayName ?? group.class.name,
    classLevel: group.class.level,
    divisionId: group.divisionId,
    divisionName: group.division.name,
    programId: group.programId,
    programName: group.program.name,
    sections: group.sections.map((section) => ({
      id: section.id,
      name: section.name,
      capacity: section.capacity,
      studentCount: section._count.enrollments,
    })),
  }))
}

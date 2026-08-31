/**
 * The Staff Portal: what a teacher can see about their OWN work.
 *
 * This service closes the gap Phase 4 identified. Student Management is
 * administrator-only, so a teacher reaches student information only here, and
 * only under two rules that are enforced on the server:
 *
 *   SCOPE  — a teacher sees a section only if they have an ACTIVE teaching
 *            assignment in it, or are its ACTIVE in-charge. Nothing else grants
 *            access; being staff is not enough.
 *
 *   FIELDS — the student data they receive is a deliberately reduced view:
 *            enough to take a register (name, roll number, placement), and
 *            nothing more. CNIC, father's CNIC, address, contact numbers and
 *            guardian details are never selected from the database at all, so
 *            they cannot leak even by mistake.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ForbiddenError, NotFoundError } from '../api/errors'
import { paginate, paginatedResult, type PaginatedResult } from './service-utils'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface MyAssignment {
  id: string
  sessionId: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionId: string
  sectionName: string
  subjectId: string
  subjectName: string
  assignedAt: Date
  /** True when the teacher is also responsible for the section as a whole. */
  isIncharge: boolean
  studentCount: number
}

export interface MySection {
  sectionId: string
  sessionId: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  subjects: string[]
  isIncharge: boolean
  studentCount: number
}

/**
 * A student as a teacher may see them.
 *
 * Deliberately small. Compare with the admin `StudentDetail`, which also carries
 * CNIC, guardian details, address and contact numbers — none of which appear
 * here, and none of which are read from the database by this service.
 */
export interface ScopedStudent {
  id: string
  studentCode: string
  fullName: string
  fatherName: string
  rollNumber: string | null
  className: string
  divisionName: string
  programName: string
  sectionId: string
  sectionName: string
  status: string
}

export interface StaffDashboardData {
  staffId: string
  fullName: string
  staffCode: string
  designation: string
  department: string | null
  currentSession: { id: string; name: string } | null
  activeAssignments: number
  sectionsTaught: number
  subjectsTaught: number
  sectionsInCharge: number
  studentsInScope: number
}

/* -------------------------------------------------------------------------- */
/* Identifying the signed-in teacher                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the staff record behind the signed-in account.
 *
 * A STAFF login with no linked staff record has no scope at all — it can see
 * nothing, rather than everything.
 */
async function requireStaffSelf(ctx: AuthContext) {
  if (ctx.role !== 'STAFF') {
    throw new ForbiddenError('The staff portal is only available to staff accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  if (!ctx.staffId) {
    throw new ForbiddenError(
      'This account is not linked to a staff record yet, so there is nothing to show. Please contact the college office.',
      { userId: ctx.userId },
    )
  }

  const staff = await prisma.staff.findFirst({
    where: { id: ctx.staffId, deletedAt: null },
    include: {
      designation: { select: { name: true } },
      department: { select: { name: true } },
    },
  })

  if (!staff) throw new NotFoundError('staff record')

  return staff
}

/**
 * The sections this teacher may see, and why.
 *
 * This single function is the whole scope rule. Everything else in the portal
 * is built on it, so there is one place to read, test and reason about.
 */
export async function getScopedSectionIds(
  staffId: string,
  academicSessionId?: string,
): Promise<{ sectionIds: string[]; inchargeSectionIds: Set<string> }> {
  const [assignments, incharges] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: {
        staffId,
        isActive: true,
        ...(academicSessionId ? { academicSessionId } : {}),
      },
      select: { sectionId: true },
    }),
    prisma.sectionIncharge.findMany({
      where: {
        staffId,
        isActive: true,
        ...(academicSessionId ? { academicSessionId } : {}),
      },
      select: { sectionId: true },
    }),
  ])

  const inchargeSectionIds = new Set(incharges.map((i) => i.sectionId))
  const sectionIds = [...new Set([...assignments.map((a) => a.sectionId), ...inchargeSectionIds])]

  return { sectionIds, inchargeSectionIds }
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function getStaffDashboard(ctx: AuthContext): Promise<StaffDashboardData> {
  authorize(ctx, 'dashboard.view')
  const staff = await requireStaffSelf(ctx)

  const currentSession = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  })

  const { sectionIds, inchargeSectionIds } = await getScopedSectionIds(
    staff.id,
    currentSession?.id,
  )

  const [assignments, studentsInScope] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: {
        staffId: staff.id,
        isActive: true,
        ...(currentSession ? { academicSessionId: currentSession.id } : {}),
      },
      select: { sectionId: true, subjectId: true },
    }),
    sectionIds.length > 0
      ? prisma.studentEnrollment.count({
          where: { sectionId: { in: sectionIds }, status: 'ACTIVE' },
        })
      : Promise.resolve(0),
  ])

  return {
    staffId: staff.id,
    fullName: staff.fullName,
    staffCode: staff.staffCode,
    designation: staff.designation.name,
    department: staff.department?.name ?? null,
    currentSession,
    activeAssignments: assignments.length,
    sectionsTaught: new Set(assignments.map((a) => a.sectionId)).size,
    subjectsTaught: new Set(assignments.map((a) => a.subjectId)).size,
    sectionsInCharge: inchargeSectionIds.size,
    studentsInScope,
  }
}

/* -------------------------------------------------------------------------- */
/* My assignments                                                             */
/* -------------------------------------------------------------------------- */

export async function getMyAssignments(
  ctx: AuthContext,
  academicSessionId?: string,
): Promise<MyAssignment[]> {
  authorize(ctx, 'dashboard.view')
  const staff = await requireStaffSelf(ctx)

  const assignments = await prisma.teacherAssignment.findMany({
    // `staffId` comes from the signed-in session, never from the request, so a
    // teacher cannot ask for somebody else's assignments.
    where: {
      staffId: staff.id,
      isActive: true,
      ...(academicSessionId ? { academicSessionId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      section: {
        include: {
          academicGroup: {
            include: {
              academicSession: { select: { id: true, name: true } },
              class: { select: { name: true, displayName: true } },
              division: { select: { name: true } },
              program: { select: { name: true } },
            },
          },
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
    orderBy: [{ assignedAt: 'desc' }],
  })

  const { inchargeSectionIds } = await getScopedSectionIds(staff.id, academicSessionId)

  return assignments.map((assignment) => {
    const group = assignment.section.academicGroup
    return {
      id: assignment.id,
      sessionId: group.academicSession.id,
      sessionName: group.academicSession.name,
      className: group.class.displayName ?? group.class.name,
      divisionName: group.division.name,
      programName: group.program.name,
      sectionId: assignment.sectionId,
      sectionName: assignment.section.name,
      subjectId: assignment.subject.id,
      subjectName: assignment.subject.name,
      assignedAt: assignment.assignedAt,
      isIncharge: inchargeSectionIds.has(assignment.sectionId),
      studentCount: assignment.section._count.enrollments,
    }
  })
}

/** The distinct sections a teacher can reach, with the subjects they teach in each. */
export async function getMySections(
  ctx: AuthContext,
  academicSessionId?: string,
): Promise<MySection[]> {
  authorize(ctx, 'dashboard.view')
  const staff = await requireStaffSelf(ctx)

  const { sectionIds, inchargeSectionIds } = await getScopedSectionIds(staff.id, academicSessionId)
  if (sectionIds.length === 0) return []

  const [sections, assignments] = await Promise.all([
    prisma.section.findMany({
      where: { id: { in: sectionIds } },
      include: {
        academicGroup: {
          include: {
            academicSession: { select: { id: true, name: true } },
            class: { select: { name: true, displayName: true } },
            division: { select: { name: true } },
            program: { select: { name: true } },
          },
        },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
    }),
    prisma.teacherAssignment.findMany({
      where: { staffId: staff.id, isActive: true, sectionId: { in: sectionIds } },
      include: { subject: { select: { name: true } } },
    }),
  ])

  return sections
    .map((section) => {
      const group = section.academicGroup
      return {
        sectionId: section.id,
        sessionId: group.academicSession.id,
        sessionName: group.academicSession.name,
        className: group.class.displayName ?? group.class.name,
        divisionName: group.division.name,
        programName: group.program.name,
        sectionName: section.name,
        subjects: assignments
          .filter((a) => a.sectionId === section.id)
          .map((a) => a.subject.name)
          .sort(),
        isIncharge: inchargeSectionIds.has(section.id),
        studentCount: section._count.enrollments,
      }
    })
    .sort((a, b) =>
      `${a.className}${a.divisionName}${a.programName}${a.sectionName}`.localeCompare(
        `${b.className}${b.divisionName}${b.programName}${b.sectionName}`,
      ),
    )
}

/* -------------------------------------------------------------------------- */
/* My students — the scoped view                                              */
/* -------------------------------------------------------------------------- */

export interface MyStudentsQuery {
  page: number
  pageSize: number
  search?: string
  /** Narrow to one section — but only one that is already in scope. */
  sectionId?: string
  academicSessionId?: string
}

export async function getMyStudents(
  ctx: AuthContext,
  query: MyStudentsQuery,
): Promise<PaginatedResult<ScopedStudent> & { sectionIds: string[] }> {
  authorize(ctx, 'students.view')
  const staff = await requireStaffSelf(ctx)

  const { sectionIds } = await getScopedSectionIds(staff.id, query.academicSessionId)

  // No assignments means no students — not "all students".
  if (sectionIds.length === 0) {
    return { ...paginatedResult<ScopedStudent>([], 0, query.page, query.pageSize), sectionIds: [] }
  }

  /**
   * If a specific section was requested it must be one of theirs. Asking for
   * somebody else's section is refused rather than quietly ignored, so an
   * attempt shows up in the logs.
   */
  if (query.sectionId && !sectionIds.includes(query.sectionId)) {
    throw new ForbiddenError(
      'You are not assigned to that section, so its students are not available to you.',
      { userId: ctx.userId, staffId: staff.id, requestedSectionId: query.sectionId },
    )
  }

  const visibleSectionIds = query.sectionId ? [query.sectionId] : sectionIds

  const where = {
    status: 'ACTIVE' as const,
    sectionId: { in: visibleSectionIds },
    ...(query.search
      ? {
          OR: [
            { rollNumber: { contains: query.search, mode: 'insensitive' as const } },
            { student: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
            { student: { studentCode: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where,
      ...paginate(query.page, query.pageSize),
      orderBy: [{ rollNumber: 'asc' }, { student: { fullName: 'asc' } }],
      select: {
        rollNumber: true,
        sectionId: true,
        // Only these student columns are ever read. Adding a sensitive field
        // here would be a deliberate act, not an accident.
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            fatherName: true,
            status: true,
          },
        },
        section: {
          select: {
            name: true,
            academicGroup: {
              select: {
                class: { select: { name: true, displayName: true } },
                division: { select: { name: true } },
                program: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.studentEnrollment.count({ where }),
  ])

  const items: ScopedStudent[] = rows.map((row) => ({
    id: row.student.id,
    studentCode: row.student.studentCode,
    fullName: row.student.fullName,
    fatherName: row.student.fatherName,
    rollNumber: row.rollNumber,
    className: row.section.academicGroup.class.displayName ?? row.section.academicGroup.class.name,
    divisionName: row.section.academicGroup.division.name,
    programName: row.section.academicGroup.program.name,
    sectionId: row.sectionId,
    sectionName: row.section.name,
    status: row.student.status,
  }))

  return { ...paginatedResult(items, total, query.page, query.pageSize), sectionIds }
}

/* -------------------------------------------------------------------------- */
/* My profile                                                                 */
/* -------------------------------------------------------------------------- */

/** The teacher's own record. Their own details, so nothing is withheld. */
export async function getMyProfile(ctx: AuthContext) {
  authorize(ctx, 'dashboard.view')
  const staff = await requireStaffSelf(ctx)

  return {
    id: staff.id,
    staffCode: staff.staffCode,
    fullName: staff.fullName,
    fatherOrHusbandName: staff.fatherOrHusbandName,
    dateOfBirth: staff.dateOfBirth,
    gender: staff.gender,
    cnicNumber: staff.cnicNumber,
    phone: staff.phone,
    email: staff.email,
    address: staff.address,
    designation: staff.designation.name,
    department: staff.department?.name ?? null,
    staffType: staff.staffType,
    qualification: staff.qualification,
    joiningDate: staff.joiningDate,
    employmentStatus: staff.employmentStatus,
  }
}

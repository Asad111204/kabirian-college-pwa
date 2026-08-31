/**
 * Staff records, teacher assignments and section in-charge (Admin area).
 *
 * Two ideas hold this together:
 *
 *  1. **A teaching assignment is Teacher → Section + Subject.** The section
 *     already knows its session, class, division and program (ADR-031), so one
 *     row expresses the whole chain and nothing here names a real program.
 *
 *  2. **Nothing is overwritten.** Removing a teacher from a subject, or
 *     replacing a section in-charge, closes the existing row and (where
 *     relevant) opens a new one — so who taught what, and when, stays on record
 *     for attendance and results later.
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
  AssignmentCreateInput,
  InchargeAssignInput,
  StaffAccountInput,
  StaffCreateInput,
  StaffListQuery,
  StaffUpdateInput,
} from '@/validation/staff'
import type { Prisma } from '@/generated/prisma/client'
import type { EmploymentStatus } from '@/generated/prisma/enums'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface StaffListItem {
  id: string
  staffCode: string
  fullName: string
  designation: string
  designationId: string
  department: string | null
  departmentId: string | null
  staffType: string
  employmentStatus: EmploymentStatus
  phone: string | null
  joiningDate: Date
  account: { userId: string; username: string; isActive: boolean } | null
  activeAssignmentCount: number
  inchargeCount: number
}

export interface AssignmentView {
  id: string
  isActive: boolean
  assignedAt: Date
  endedAt: Date | null
  sessionId: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionId: string
  sectionName: string
  subjectId: string
  subjectName: string
}

export interface InchargeView {
  id: string
  isActive: boolean
  assignedAt: Date
  endedAt: Date | null
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionId: string
  sectionName: string
  studentCount: number
}

export interface StaffDetail extends StaffListItem {
  fatherOrHusbandName: string | null
  dateOfBirth: Date | null
  gender: string | null
  cnicNumber: string | null
  email: string | null
  address: string | null
  qualification: string | null
  leavingDate: Date | null
  notes: string | null
  createdAt: Date
  assignments: AssignmentView[]
  incharges: InchargeView[]
}

/* -------------------------------------------------------------------------- */
/* Shared query pieces                                                        */
/* -------------------------------------------------------------------------- */

/** Enough of a section to describe where an assignment sits. */
const sectionPlaceInclude = {
  academicGroup: {
    include: {
      academicSession: { select: { id: true, name: true } },
      class: { select: { name: true, displayName: true } },
      division: { select: { name: true } },
      program: { select: { name: true } },
    },
  },
} as const

/**
 * Staff Management is an administrator area.
 *
 * A staff member sees their OWN assignments and their OWN students through the
 * staff-portal service, which applies scope. These functions return the whole
 * college's staff records, so they additionally require the ADMIN role — the
 * same reasoning as ADR-058 for students.
 */
const assertAdminArea = (ctx: AuthContext) => assertAdminAreaFor(ctx, 'Staff management')

/**
 * Confirms the section really belongs to the class, division, program and
 * session that were chosen in the form.
 *
 * Only `sectionId` is stored; the other four ids exist so a stale or tampered
 * request cannot place an assignment somewhere that was never selected.
 */
async function resolveSection(selection: {
  academicSessionId: string
  classId: string
  divisionId: string
  programId: string
  sectionId: string
}) {
  const section = await prisma.section.findUnique({
    where: { id: selection.sectionId },
    include: {
      academicGroup: {
        include: { class: true, division: true, program: true, academicSession: true },
      },
    },
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
      `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name} is deactivated.`,
    )
  }

  return section
}

/** A staff member who may still be given work. */
function assertEmployable(staff: { fullName: string; employmentStatus: EmploymentStatus }): void {
  if (staff.employmentStatus !== 'ACTIVE') {
    throw new ConflictError(
      `${staff.fullName} is not currently active, so they cannot be given new assignments. Set their status to Active first.`,
    )
  }
}

function placeOf(section: {
  name: string
  academicGroup: {
    academicSession: { id: string; name: string }
    class: { name: string; displayName: string | null }
    division: { name: string }
    program: { name: string }
  }
}) {
  const g = section.academicGroup
  return {
    sessionId: g.academicSession.id,
    sessionName: g.academicSession.name,
    className: g.class.displayName ?? g.class.name,
    divisionName: g.division.name,
    programName: g.program.name,
    sectionName: section.name,
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listStaff(
  ctx: AuthContext,
  query: StaffListQuery,
): Promise<PaginatedResult<StaffListItem> & { counts: Record<string, number> }> {
  authorize(ctx, 'staff.view')
  assertAdminArea(ctx)

  const where: Prisma.StaffWhereInput = {
    deletedAt: null,
    ...(query.status !== 'ALL' ? { employmentStatus: query.status } : {}),
    ...(query.staffType !== 'ALL' ? { staffType: query.staffType } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.designationId ? { designationId: query.designationId } : {}),
    ...(query.account === 'LINKED' ? { userId: { not: null } } : {}),
    ...(query.account === 'NONE' ? { userId: null } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { staffCode: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const orderBy: Prisma.StaffOrderByWithRelationInput =
    query.sort === 'staffCode'
      ? { staffCode: query.direction }
      : query.sort === 'joiningDate'
        ? { joiningDate: query.direction }
        : query.sort === 'createdAt'
          ? { createdAt: query.direction }
          : { fullName: query.direction }

  const [rows, total, statusCounts] = await Promise.all([
    prisma.staff.findMany({
      where,
      orderBy,
      ...paginate(query.page, query.pageSize),
      include: {
        user: { select: { id: true, username: true, status: true } },
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: {
          select: {
            teacherAssignments: { where: { isActive: true } },
            sectionsInCharge: { where: { isActive: true } },
          },
        },
      },
    }),
    prisma.staff.count({ where }),
    prisma.staff.groupBy({
      by: ['employmentStatus'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ])

  const counts: Record<string, number> = {}
  let all = 0
  for (const row of statusCounts) {
    counts[row.employmentStatus] = row._count._all
    all += row._count._all
  }
  counts.ALL = all

  const items: StaffListItem[] = rows.map((staff) => ({
    id: staff.id,
    staffCode: staff.staffCode,
    fullName: staff.fullName,
    designation: staff.designation.name,
    designationId: staff.designationId,
    department: staff.department?.name ?? null,
    departmentId: staff.departmentId,
    staffType: staff.staffType,
    employmentStatus: staff.employmentStatus,
    phone: staff.phone,
    joiningDate: staff.joiningDate,
    account: staff.user
      ? { userId: staff.user.id, username: staff.user.username, isActive: staff.user.status === 'ACTIVE' }
      : null,
    activeAssignmentCount: staff._count.teacherAssignments,
    inchargeCount: staff._count.sectionsInCharge,
  }))

  return { ...paginatedResult(items, total, query.page, query.pageSize), counts }
}

export async function getStaff(ctx: AuthContext, id: string): Promise<StaffDetail> {
  authorize(ctx, 'staff.view')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, username: true, status: true } },
      designation: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      teacherAssignments: {
        orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
        include: { subject: { select: { id: true, name: true } }, section: { include: sectionPlaceInclude } },
      },
      sectionsInCharge: {
        orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
        include: {
          section: {
            include: {
              ...sectionPlaceInclude,
              _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
            },
          },
        },
      },
    },
  })

  if (!staff) throw new NotFoundError('staff member')

  return {
    id: staff.id,
    staffCode: staff.staffCode,
    fullName: staff.fullName,
    designation: staff.designation.name,
    designationId: staff.designationId,
    department: staff.department?.name ?? null,
    departmentId: staff.departmentId,
    staffType: staff.staffType,
    employmentStatus: staff.employmentStatus,
    phone: staff.phone,
    joiningDate: staff.joiningDate,
    account: staff.user
      ? { userId: staff.user.id, username: staff.user.username, isActive: staff.user.status === 'ACTIVE' }
      : null,
    activeAssignmentCount: staff.teacherAssignments.filter((a) => a.isActive).length,
    inchargeCount: staff.sectionsInCharge.filter((i) => i.isActive).length,
    fatherOrHusbandName: staff.fatherOrHusbandName,
    dateOfBirth: staff.dateOfBirth,
    gender: staff.gender,
    cnicNumber: staff.cnicNumber,
    email: staff.email,
    address: staff.address,
    qualification: staff.qualification,
    leavingDate: staff.leavingDate,
    notes: staff.notes,
    createdAt: staff.createdAt,
    assignments: staff.teacherAssignments.map((assignment) => ({
      id: assignment.id,
      isActive: assignment.isActive,
      assignedAt: assignment.assignedAt,
      endedAt: assignment.endedAt,
      ...placeOf(assignment.section),
      sectionId: assignment.sectionId,
      subjectId: assignment.subject.id,
      subjectName: assignment.subject.name,
    })),
    incharges: staff.sectionsInCharge.map((incharge) => ({
      id: incharge.id,
      isActive: incharge.isActive,
      assignedAt: incharge.assignedAt,
      endedAt: incharge.endedAt,
      ...placeOf(incharge.section),
      sectionId: incharge.sectionId,
      studentCount: incharge.section._count.enrollments,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Creating and editing                                                       */
/* -------------------------------------------------------------------------- */

function toStaffData(input: StaffCreateInput | StaffUpdateInput) {
  return {
    fullName: input.fullName,
    fatherOrHusbandName: input.fatherOrHusbandName ?? null,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    gender: input.gender ?? null,
    cnicNumber: input.cnicNumber ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    designationId: input.designationId,
    departmentId: input.departmentId ?? null,
    staffType: input.staffType,
    qualification: input.qualification ?? null,
    notes: input.notes ?? null,
  }
}

export interface CreateStaffResult {
  staff: StaffDetail
  /** Present only when a portal account was created at the same time. */
  account?: { username: string; temporaryPassword: string }
}

export async function createStaff(
  ctx: AuthContext,
  input: StaffCreateInput,
): Promise<CreateStaffResult> {
  authorize(ctx, 'staff.create')
  assertAdminArea(ctx)

  const designation = await prisma.designation.findUnique({ where: { id: input.designationId } })
  if (!designation) throw new NotFoundError('designation')

  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId } })
    if (!department) throw new NotFoundError('department')
  }

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

  let accountResult: { username: string; temporaryPassword: string } | undefined

  const staffId = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        // The staff code comes from the shared counter, never from the browser.
        const staffCode = await nextCode('STAFF', tx)

        let userId: string | null = null
        if (input.createAccount && input.username) {
          const temporaryPassword = generateTemporaryPassword()
          const user = await tx.user.create({
            data: {
              username: input.username,
              fullName: input.fullName,
              email: input.email ?? null,
              passwordHash: await hashPassword(temporaryPassword),
              role: 'STAFF',
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
              after: { username: user.username, role: 'STAFF', status: 'ACTIVE' },
              metadata: { createdWithStaff: true },
            },
            tx,
          )
        }

        const staff = await tx.staff.create({
          data: {
            ...toStaffData(input),
            staffCode,
            joiningDate: new Date(input.joiningDate),
            employmentStatus: 'ACTIVE',
            userId,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: 'staff.created',
            entityType: 'staff',
            entityId: staff.id,
            entityLabel: `${staff.staffCode} ${staff.fullName}`,
            after: {
              staffCode: staff.staffCode,
              fullName: staff.fullName,
              designation: designation.name,
              staffType: staff.staffType,
            },
            metadata: { accountCreated: Boolean(userId) },
          },
          tx,
        )

        return staff.id
      }),
    {
      staff_code: 'That staff ID is already in use — please try again.',
      cnic_number: 'That CNIC is already recorded for another staff member.',
      username: 'That username is already taken.',
    },
  )

  return {
    staff: await getStaff(ctx, staffId),
    ...(accountResult ? { account: accountResult } : {}),
  }
}

export async function updateStaff(
  ctx: AuthContext,
  id: string,
  input: StaffUpdateInput,
): Promise<StaffDetail> {
  authorize(ctx, 'staff.update')
  assertAdminArea(ctx)

  const before = await prisma.staff.findFirst({
    where: { id, deletedAt: null },
    include: { designation: { select: { name: true } } },
  })
  if (!before) throw new NotFoundError('staff member')

  const designation = await prisma.designation.findUnique({ where: { id: input.designationId } })
  if (!designation) throw new NotFoundError('designation')

  await withUniqueConstraintHandling(
    () =>
      prisma.staff.update({
        where: { id },
        data: { ...toStaffData(input), joiningDate: new Date(input.joiningDate) },
      }),
    { cnic_number: 'That CNIC is already recorded for another staff member.' },
  )

  await writeAuditLog(ctx, {
    action: 'staff.updated',
    entityType: 'staff',
    entityId: id,
    entityLabel: `${before.staffCode} ${input.fullName}`,
    before: { fullName: before.fullName, designation: before.designation.name, staffType: before.staffType },
    after: { fullName: input.fullName, designation: designation.name, staffType: input.staffType },
  })

  return getStaff(ctx, id)
}

/**
 * Changes the employment status.
 *
 * When someone stops working here, their teaching assignments and section
 * in-charge roles are closed so they no longer appear in class lists and lose
 * their scoped access — but every row is kept as history.
 */
export async function setStaffStatus(
  ctx: AuthContext,
  id: string,
  status: EmploymentStatus,
  options: { leavingDate?: string; reason?: string } = {},
): Promise<StaffDetail> {
  authorize(ctx, 'staff.update')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({ where: { id, deletedAt: null } })
  if (!staff) throw new NotFoundError('staff member')
  if (staff.employmentStatus === status) return getStaff(ctx, id)

  // Anything other than "still working here" ends their responsibilities.
  const stillEmployed = status === 'ACTIVE' || status === 'ON_LEAVE'

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: {
        employmentStatus: status,
        leavingDate: stillEmployed
          ? null
          : options.leavingDate
            ? new Date(options.leavingDate)
            : new Date(),
      },
    })

    if (!stillEmployed) {
      const endedAt = options.leavingDate ? new Date(options.leavingDate) : new Date()

      const closedAssignments = await tx.teacherAssignment.updateMany({
        where: { staffId: id, isActive: true },
        data: { isActive: false, endedAt },
      })
      const closedIncharges = await tx.sectionIncharge.updateMany({
        where: { staffId: id, isActive: true },
        data: { isActive: false, endedAt },
      })

      if (closedAssignments.count > 0 || closedIncharges.count > 0) {
        await writeAuditLog(
          ctx,
          {
            action: 'assignment.closed',
            entityType: 'staff',
            entityId: id,
            entityLabel: `${staff.staffCode} ${staff.fullName}`,
            metadata: {
              reason: `Staff status changed to ${status}`,
              assignmentsClosed: closedAssignments.count,
              inchargeRolesClosed: closedIncharges.count,
            },
          },
          tx,
        )
      }
    }

    await writeAuditLog(
      ctx,
      {
        action: 'staff.status_changed',
        entityType: 'staff',
        entityId: id,
        entityLabel: `${staff.staffCode} ${staff.fullName}`,
        before: { employmentStatus: staff.employmentStatus },
        after: { employmentStatus: status },
        metadata: { reason: options.reason ?? null },
      },
      tx,
    )
  })

  return getStaff(ctx, id)
}

/* -------------------------------------------------------------------------- */
/* Teacher assignments                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Assigns a teacher to teach one subject in one section.
 *
 * Checks, in order: the staff member exists and is active; they are teaching
 * staff; the section really belongs to the chosen class, division, program and
 * session; and the subject is actually part of that group's curriculum.
 */
export async function createAssignment(
  ctx: AuthContext,
  staffId: string,
  input: AssignmentCreateInput,
): Promise<StaffDetail> {
  authorize(ctx, 'staff.assign')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({ where: { id: staffId, deletedAt: null } })
  if (!staff) throw new NotFoundError('staff member')
  assertEmployable(staff)

  if (staff.staffType !== 'TEACHING') {
    throw new ConflictError(
      `${staff.fullName} is recorded as ${staff.staffType.toLowerCase()} staff. Change their staff type to Teaching before assigning subjects.`,
    )
  }

  const section = await resolveSection(input)
  const group = section.academicGroup

  const subject = await prisma.subject.findUnique({ where: { id: input.subjectId } })
  if (!subject) throw new NotFoundError('subject')

  /**
   * The subject must be in the curriculum for this group's class and program.
   * Without this a teacher could be assigned Biology to an ICS section, which
   * would then appear on timetables and mark sheets that make no sense.
   */
  const inCurriculum = await prisma.curriculumSubject.findFirst({
    where: {
      academicSessionId: group.academicSessionId,
      classId: group.classId,
      programId: group.programId,
      subjectId: input.subjectId,
    },
    select: { id: true },
  })

  if (!inCurriculum) {
    throw new ConflictError(
      `${subject.name} is not part of the ${group.class.name} · ${group.program.name} curriculum for ${group.academicSession.name}. Add it to the curriculum first.`,
      { subjectId: ['Not in this program’s curriculum.'] },
    )
  }

  const label = `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name} · ${subject.name}`

  await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.teacherAssignment.create({
          data: {
            staffId,
            sectionId: section.id,
            subjectId: input.subjectId,
            // Taken from the section, never from the request — this is what makes
            // it impossible to record an assignment against the wrong session.
            academicSessionId: section.academicSessionId,
            isActive: true,
            assignedAt: input.assignedAt ? new Date(input.assignedAt) : new Date(),
            createdByUserId: ctx.userId,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: 'assignment.created',
            entityType: 'teacher_assignment',
            entityId: staffId,
            entityLabel: `${staff.staffCode} ${staff.fullName}`,
            after: { session: group.academicSession.name, assignment: label },
          },
          tx,
        )
      }),
    {
      staff_id: `${staff.fullName} is already assigned ${subject.name} in Section ${section.name}.`,
      section_id: `${staff.fullName} is already assigned ${subject.name} in Section ${section.name}.`,
      subject_id: `${staff.fullName} is already assigned ${subject.name} in Section ${section.name}.`,
    },
  )

  return getStaff(ctx, staffId)
}

/**
 * Ends an assignment. The row is kept and marked closed, because attendance and
 * marks recorded under it must still be attributable.
 */
export async function closeAssignment(
  ctx: AuthContext,
  staffId: string,
  assignmentId: string,
  reason?: string,
): Promise<StaffDetail> {
  authorize(ctx, 'staff.assign')
  assertAdminArea(ctx)

  const assignment = await prisma.teacherAssignment.findFirst({
    where: { id: assignmentId, staffId },
    include: { subject: true, section: { include: sectionPlaceInclude }, staff: true },
  })
  if (!assignment) throw new NotFoundError('assignment')
  if (!assignment.isActive) throw new ConflictError('That assignment has already been closed.')

  const place = placeOf(assignment.section)

  await prisma.$transaction(async (tx) => {
    await tx.teacherAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false, endedAt: new Date() },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'assignment.closed',
        entityType: 'teacher_assignment',
        entityId: staffId,
        entityLabel: `${assignment.staff.staffCode} ${assignment.staff.fullName}`,
        before: {
          assignment: `${place.className} · ${place.divisionName} · ${place.programName} · Section ${place.sectionName} · ${assignment.subject.name}`,
        },
        metadata: { reason: reason ?? null, historyKept: true },
      },
      tx,
    )
  })

  return getStaff(ctx, staffId)
}

/* -------------------------------------------------------------------------- */
/* Section in-charge                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Makes a staff member the in-charge of a section.
 *
 * A section has at most one active in-charge, enforced by a partial unique
 * index. Appointing a replacement closes the current one first, so both stay on
 * record.
 */
export async function assignIncharge(
  ctx: AuthContext,
  staffId: string,
  input: InchargeAssignInput,
): Promise<StaffDetail> {
  authorize(ctx, 'staff.assign')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({ where: { id: staffId, deletedAt: null } })
  if (!staff) throw new NotFoundError('staff member')
  assertEmployable(staff)

  const section = await resolveSection(input)
  const group = section.academicGroup
  const label = `${group.class.name} · ${group.division.name} · ${group.program.name} · Section ${section.name}`

  const current = await prisma.sectionIncharge.findFirst({
    where: { sectionId: section.id, isActive: true },
    include: { staff: { select: { fullName: true, staffCode: true } } },
  })

  if (current?.staffId === staffId) {
    throw new ConflictError(`${staff.fullName} is already the in-charge of ${label}.`)
  }

  await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        if (current) {
          await tx.sectionIncharge.update({
            where: { id: current.id },
            data: { isActive: false, endedAt: new Date() },
          })
        }

        await tx.sectionIncharge.create({
          data: {
            sectionId: section.id,
            staffId,
            academicSessionId: section.academicSessionId,
            isActive: true,
            assignedAt: input.assignedAt ? new Date(input.assignedAt) : new Date(),
            createdByUserId: ctx.userId,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: current ? 'incharge.changed' : 'incharge.assigned',
            entityType: 'section_incharge',
            entityId: section.id,
            entityLabel: label,
            before: current ? { incharge: `${current.staff.staffCode} ${current.staff.fullName}` } : undefined,
            after: { incharge: `${staff.staffCode} ${staff.fullName}` },
            metadata: { previousKept: Boolean(current) },
          },
          tx,
        )
      }),
    { section_id: `${label} already has an in-charge.` },
  )

  return getStaff(ctx, staffId)
}

/** Removes the in-charge role without appointing a replacement. */
export async function removeIncharge(
  ctx: AuthContext,
  staffId: string,
  inchargeId: string,
): Promise<StaffDetail> {
  authorize(ctx, 'staff.assign')
  assertAdminArea(ctx)

  const incharge = await prisma.sectionIncharge.findFirst({
    where: { id: inchargeId, staffId },
    include: { section: { include: sectionPlaceInclude }, staff: true },
  })
  if (!incharge) throw new NotFoundError('in-charge record')
  if (!incharge.isActive) throw new ConflictError('That in-charge role has already ended.')

  const place = placeOf(incharge.section)

  await prisma.$transaction(async (tx) => {
    await tx.sectionIncharge.update({
      where: { id: inchargeId },
      data: { isActive: false, endedAt: new Date() },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'incharge.removed',
        entityType: 'section_incharge',
        entityId: incharge.sectionId,
        entityLabel: `${place.className} · ${place.divisionName} · ${place.programName} · Section ${place.sectionName}`,
        before: { incharge: `${incharge.staff.staffCode} ${incharge.staff.fullName}` },
        metadata: { historyKept: true },
      },
      tx,
    )
  })

  return getStaff(ctx, staffId)
}

/* -------------------------------------------------------------------------- */
/* Portal account                                                             */
/* -------------------------------------------------------------------------- */

export interface LinkStaffAccountResult {
  staff: StaffDetail
  account?: { username: string; temporaryPassword: string }
}

export async function linkStaffAccount(
  ctx: AuthContext,
  id: string,
  input: StaffAccountInput,
): Promise<LinkStaffAccountResult> {
  authorize(ctx, 'staff.update')
  authorize(ctx, 'users.manage')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({ where: { id, deletedAt: null } })
  if (!staff) throw new NotFoundError('staff member')

  if (staff.userId) {
    throw new ConflictError(
      `${staff.fullName} already has a portal account. Unlink it before linking a different one.`,
    )
  }

  let accountResult: { username: string; temporaryPassword: string } | undefined

  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { student: { select: { id: true } }, staff: { select: { id: true } } },
    })
    if (!user) throw new NotFoundError('user account')
    if (user.role !== 'STAFF') {
      throw new ConflictError('Only an account with the Staff role can be linked to a staff record.')
    }
    if (user.student || user.staff) {
      throw new ConflictError('That account is already linked to another record.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.staff.update({ where: { id }, data: { userId: user.id } })
      await writeAuditLog(
        ctx,
        {
          action: 'staff.account_linked',
          entityType: 'staff',
          entityId: id,
          entityLabel: `${staff.staffCode} ${staff.fullName}`,
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
              fullName: staff.fullName,
              email: staff.email,
              passwordHash,
              role: 'STAFF',
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          })

          await tx.staff.update({ where: { id }, data: { userId: user.id } })

          await writeAuditLog(
            ctx,
            {
              action: 'user.created',
              entityType: 'user',
              entityId: user.id,
              entityLabel: `${staff.fullName} (${user.username})`,
              after: { username: user.username, role: 'STAFF', status: 'ACTIVE' },
              metadata: { createdForStaff: staff.staffCode },
            },
            tx,
          )

          await writeAuditLog(
            ctx,
            {
              action: 'staff.account_linked',
              entityType: 'staff',
              entityId: id,
              entityLabel: `${staff.staffCode} ${staff.fullName}`,
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
    staff: await getStaff(ctx, id),
    ...(accountResult ? { account: accountResult } : {}),
  }
}

/** Disconnects the login. The account itself is kept, not deleted. */
export async function unlinkStaffAccount(ctx: AuthContext, id: string): Promise<StaffDetail> {
  authorize(ctx, 'staff.update')
  authorize(ctx, 'users.manage')
  assertAdminArea(ctx)

  const staff = await prisma.staff.findFirst({
    where: { id, deletedAt: null },
    include: { user: { select: { username: true } } },
  })
  if (!staff) throw new NotFoundError('staff member')
  if (!staff.userId || !staff.user) {
    throw new ConflictError('This staff member does not have a portal account linked.')
  }

  const username = staff.user.username

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id }, data: { userId: null } })
    await writeAuditLog(
      ctx,
      {
        action: 'staff.account_unlinked',
        entityType: 'staff',
        entityId: id,
        entityLabel: `${staff.staffCode} ${staff.fullName}`,
        before: { username },
        metadata: { accountKept: true },
      },
      tx,
    )
  })

  return getStaff(ctx, id)
}

/* -------------------------------------------------------------------------- */
/* Options for the assignment form                                            */
/* -------------------------------------------------------------------------- */

export interface AssignmentOptionGroup {
  academicGroupId: string
  classId: string
  className: string
  classLevel: number
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  sections: {
    id: string
    name: string
    inchargeName: string | null
  }[]
  /** Subjects this class + program actually studies, from the curriculum. */
  subjects: { id: string; name: string; code: string | null }[]
}

/**
 * Everything the assignment form needs for one session, in a single request:
 * each Class × Division × Program combination, its sections (with the current
 * in-charge) and the subjects its curriculum contains.
 *
 * All read from the database, so a program or subject added minutes ago is here.
 */
export async function getAssignmentOptions(
  ctx: AuthContext,
  academicSessionId: string,
): Promise<AssignmentOptionGroup[]> {
  authorize(ctx, 'staff.view')
  assertAdminArea(ctx)

  const [groups, curriculum] = await Promise.all([
    prisma.academicGroup.findMany({
      where: { academicSessionId, isActive: true },
      include: {
        class: { select: { id: true, name: true, displayName: true, level: true } },
        division: { select: { id: true, name: true } },
        program: { select: { id: true, name: true } },
        sections: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            incharges: {
              where: { isActive: true },
              include: { staff: { select: { fullName: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: [
        { class: { level: 'asc' } },
        { division: { sortOrder: 'asc' } },
        { program: { sortOrder: 'asc' } },
      ],
    }),
    prisma.curriculumSubject.findMany({
      where: { academicSessionId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: [{ sortOrder: 'asc' }, { subject: { name: 'asc' } }],
    }),
  ])

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
      inchargeName: section.incharges[0]?.staff.fullName ?? null,
    })),
    subjects: curriculum
      .filter((entry) => entry.classId === group.classId && entry.programId === group.programId)
      .map((entry) => entry.subject),
  }))
}

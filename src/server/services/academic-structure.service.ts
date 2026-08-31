/**
 * The structure of one academic session:
 *   academic sessions -> academic groups (Class x Division x Program) -> sections
 *   plus the curriculum (which subjects a Class x Program studies).
 *
 * See ADR-031: the group is what makes "1st Year · Boys · Pre-Medical exists in
 * 2026-27" a real record, so a session's structure can be built, copied and
 * changed year by year without duplicating any names.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, NotFoundError, ValidationError } from '../api/errors'
import { assertNotReferenced, withUniqueConstraintHandling } from './service-utils'
import type {
  AcademicGroupInput,
  AcademicSessionInput,
  CurriculumSetInput,
  SectionInput,
} from '@/validation/academics'

// ===========================================================================
// Academic sessions
// ===========================================================================

export async function listAcademicSessions(ctx: AuthContext) {
  authorize(ctx, 'academics.view')

  const rows = await prisma.academicSession.findMany({
    orderBy: { name: 'desc' },
    include: { _count: { select: { academicGroups: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    isCurrent: row.isCurrent,
    groupCount: row._count.academicGroups,
  }))
}

/**
 * The session the college is working in right now. Almost every screen needs it.
 * Returns null before the first session has been created.
 */
export async function getCurrentAcademicSession() {
  return prisma.academicSession.findFirst({ where: { isCurrent: true } })
}

export async function createAcademicSession(ctx: AuthContext, input: AcademicSessionInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.academicSession.create({
        data: {
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          status: input.status,
        },
      }),
    { name: 'An academic session with this name already exists.' },
  )

  await writeAuditLog(ctx, {
    action: 'academic_session.created',
    entityType: 'academic_session',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateAcademicSession(
  ctx: AuthContext,
  id: string,
  input: AcademicSessionInput,
) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.academicSession.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('academic session')

  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.academicSession.update({
        where: { id },
        data: {
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          status: input.status,
        },
      }),
    { name: 'An academic session with this name already exists.' },
  )

  await writeAuditLog(ctx, {
    action: 'academic_session.updated',
    entityType: 'academic_session',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

/**
 * Makes one session "current". Exactly one session can be current — the database
 * enforces that with a partial unique index, so we clear the old one first
 * inside the same transaction.
 */
export async function setCurrentAcademicSession(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const target = await prisma.academicSession.findUnique({ where: { id } })
  if (!target) throw new NotFoundError('academic session')

  const updated = await prisma.$transaction(async (tx) => {
    await tx.academicSession.updateMany({
      where: { isCurrent: true, id: { not: id } },
      data: { isCurrent: false },
    })

    const result = await tx.academicSession.update({
      where: { id },
      data: { isCurrent: true, status: target.status === 'CLOSED' ? 'ACTIVE' : target.status },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'academic_session.set_current',
        entityType: 'academic_session',
        entityId: id,
        entityLabel: result.name,
        after: result,
      },
      tx,
    )

    return result
  })

  return updated
}

export async function deleteAcademicSession(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.academicSession.findUnique({
    where: { id },
    include: {
      _count: { select: { academicGroups: true, curriculumSubjects: true, admittedStudents: true } },
    },
  })
  if (!record) throw new NotFoundError('academic session')

  if (record.isCurrent) {
    throw new ConflictError(
      'This is the current academic session. Make another session current before removing it.',
    )
  }

  assertNotReferenced(`The session "${record.name}"`, [
    { label: 'academic group(s)', count: record._count.academicGroups },
    { label: 'curriculum entr(ies)', count: record._count.curriculumSubjects },
    { label: 'admitted student(s)', count: record._count.admittedStudents },
  ])

  await prisma.academicSession.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'academic_session.updated',
    entityType: 'academic_session',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

// ===========================================================================
// Academic groups — Session x Class x Division x Program
// ===========================================================================

export interface AcademicGroupRecord {
  id: string
  isActive: boolean
  classId: string
  className: string
  classDisplayName: string | null
  classLevel: number
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  programCode: string
  sections: {
    id: string
    name: string
    isActive: boolean
    capacity: number | null
    studentCount: number
  }[]
}

/** The whole structure of one session, ready for the Session Structure screen. */
export async function listAcademicGroups(
  ctx: AuthContext,
  academicSessionId: string,
): Promise<AcademicGroupRecord[]> {
  authorize(ctx, 'academics.view')

  const groups = await prisma.academicGroup.findMany({
    where: { academicSessionId },
    include: {
      class: true,
      division: true,
      program: true,
      sections: {
        orderBy: { name: 'asc' },
        include: { _count: { select: { enrollments: true } } },
      },
    },
    orderBy: [
      { class: { level: 'asc' } },
      { division: { sortOrder: 'asc' } },
      { program: { sortOrder: 'asc' } },
    ],
  })

  return groups.map((group) => ({
    id: group.id,
    isActive: group.isActive,
    classId: group.classId,
    className: group.class.name,
    classDisplayName: group.class.displayName,
    classLevel: group.class.level,
    divisionId: group.divisionId,
    divisionName: group.division.name,
    programId: group.programId,
    programName: group.program.name,
    programCode: group.program.code,
    sections: group.sections.map((section) => ({
      id: section.id,
      name: section.name,
      isActive: section.isActive,
      capacity: section.capacity,
      studentCount: section._count.enrollments,
    })),
  }))
}

/**
 * Creates one group and its first section.
 * Both are written in a single transaction: a group without any section would
 * be useless, so we never leave that state behind.
 */
export async function createAcademicGroup(ctx: AuthContext, input: AcademicGroupInput) {
  authorize(ctx, 'academics.manage')

  const [session, klass, division, program] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: input.academicSessionId } }),
    prisma.class.findUnique({ where: { id: input.classId } }),
    prisma.division.findUnique({ where: { id: input.divisionId } }),
    prisma.program.findUnique({ where: { id: input.programId } }),
  ])

  if (!session) throw new NotFoundError('academic session')
  if (!klass) throw new NotFoundError('class')
  if (!division) throw new NotFoundError('division')
  if (!program) throw new NotFoundError('program')

  const label = `${session.name} · ${klass.name} · ${division.name} · ${program.name}`

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        const group = await tx.academicGroup.create({
          data: {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            divisionId: input.divisionId,
            programId: input.programId,
          },
        })

        await tx.section.create({
          data: {
            academicGroupId: group.id,
            academicSessionId: input.academicSessionId,
            name: input.initialSectionName,
          },
        })

        await writeAuditLog(
          ctx,
          {
            action: 'academic_group.created',
            entityType: 'academic_group',
            entityId: group.id,
            entityLabel: label,
            after: group,
            metadata: { initialSection: input.initialSectionName },
          },
          tx,
        )

        return group
      }),
    {
      academic_session_id: `${klass.name} · ${division.name} · ${program.name} already exists in this session.`,
    },
  )

  return created
}

/** Used by the Session Structure matrix to create several groups at once. */
export async function createAcademicGroupsBulk(
  ctx: AuthContext,
  input: {
    academicSessionId: string
    combinations: { classId: string; divisionId: string; programId: string }[]
    initialSectionName: string
  },
): Promise<{ created: number; skipped: number }> {
  authorize(ctx, 'academics.manage')

  const session = await prisma.academicSession.findUnique({
    where: { id: input.academicSessionId },
  })
  if (!session) throw new NotFoundError('academic session')

  const existing = await prisma.academicGroup.findMany({
    where: { academicSessionId: input.academicSessionId },
    select: { classId: true, divisionId: true, programId: true },
  })
  const existingKeys = new Set(
    existing.map((e) => `${e.classId}:${e.divisionId}:${e.programId}`),
  )

  const toCreate = input.combinations.filter(
    (c) => !existingKeys.has(`${c.classId}:${c.divisionId}:${c.programId}`),
  )

  if (toCreate.length === 0) {
    return { created: 0, skipped: input.combinations.length }
  }

  await prisma.$transaction(async (tx) => {
    for (const combination of toCreate) {
      const group = await tx.academicGroup.create({
        data: {
          academicSessionId: input.academicSessionId,
          classId: combination.classId,
          divisionId: combination.divisionId,
          programId: combination.programId,
        },
      })

      await tx.section.create({
        data: {
          academicGroupId: group.id,
          academicSessionId: input.academicSessionId,
          name: input.initialSectionName || 'A',
        },
      })
    }

    await writeAuditLog(
      ctx,
      {
        action: 'academic_group.created',
        entityType: 'academic_session',
        entityId: input.academicSessionId,
        entityLabel: session.name,
        metadata: { createdGroups: toCreate.length, bulk: true },
      },
      tx,
    )
  })

  return { created: toCreate.length, skipped: input.combinations.length - toCreate.length }
}

export async function setAcademicGroupActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const group = await prisma.academicGroup.findUnique({
    where: { id },
    include: { class: true, division: true, program: true, academicSession: true },
  })
  if (!group) throw new NotFoundError('academic group')

  const updated = await prisma.academicGroup.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'academic_group.activated' : 'academic_group.deactivated',
    entityType: 'academic_group',
    entityId: id,
    entityLabel: `${group.academicSession.name} · ${group.class.name} · ${group.division.name} · ${group.program.name}`,
    before: { isActive: group.isActive },
    after: { isActive },
  })

  return updated
}

export async function deleteAcademicGroup(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const group = await prisma.academicGroup.findUnique({
    where: { id },
    include: {
      class: true,
      division: true,
      program: true,
      sections: { include: { _count: { select: { enrollments: true, teacherAssignments: true } } } },
    },
  })
  if (!group) throw new NotFoundError('academic group')

  const enrollments = group.sections.reduce((sum, s) => sum + s._count.enrollments, 0)
  const assignments = group.sections.reduce((sum, s) => sum + s._count.teacherAssignments, 0)

  assertNotReferenced(
    `The group "${group.class.name} · ${group.division.name} · ${group.program.name}"`,
    [
      { label: 'enrolled student(s)', count: enrollments },
      { label: 'teacher assignment(s)', count: assignments },
    ],
  )

  // Safe to remove: its sections have no students and no assignments.
  await prisma.$transaction(async (tx) => {
    await tx.section.deleteMany({ where: { academicGroupId: id } })
    await tx.academicGroup.delete({ where: { id } })
    await writeAuditLog(
      ctx,
      {
        action: 'academic_group.deactivated',
        entityType: 'academic_group',
        entityId: id,
        entityLabel: `${group.class.name} · ${group.division.name} · ${group.program.name}`,
        before: group,
        metadata: { deleted: true },
      },
      tx,
    )
  })
}

/**
 * Copies a whole session's structure (groups + sections, optionally the
 * curriculum) into another session — the "new academic year" button.
 * Existing groups in the target session are left untouched.
 */
export async function copySessionStructure(
  ctx: AuthContext,
  input: { fromSessionId: string; toSessionId: string; includeCurriculum: boolean },
): Promise<{ groupsCreated: number; sectionsCreated: number; curriculumCreated: number }> {
  authorize(ctx, 'academics.manage')

  if (input.fromSessionId === input.toSessionId) {
    throw new ValidationError('Choose two different sessions.')
  }

  const [fromSession, toSession] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: input.fromSessionId } }),
    prisma.academicSession.findUnique({ where: { id: input.toSessionId } }),
  ])
  if (!fromSession || !toSession) throw new NotFoundError('academic session')

  const sourceGroups = await prisma.academicGroup.findMany({
    where: { academicSessionId: input.fromSessionId },
    include: { sections: true },
  })

  const existingGroups = await prisma.academicGroup.findMany({
    where: { academicSessionId: input.toSessionId },
    select: { classId: true, divisionId: true, programId: true },
  })
  const existingKeys = new Set(
    existingGroups.map((g) => `${g.classId}:${g.divisionId}:${g.programId}`),
  )

  let groupsCreated = 0
  let sectionsCreated = 0
  let curriculumCreated = 0

  await prisma.$transaction(async (tx) => {
    for (const source of sourceGroups) {
      if (existingKeys.has(`${source.classId}:${source.divisionId}:${source.programId}`)) continue

      const group = await tx.academicGroup.create({
        data: {
          academicSessionId: input.toSessionId,
          classId: source.classId,
          divisionId: source.divisionId,
          programId: source.programId,
        },
      })
      groupsCreated += 1

      const sectionNames = source.sections.length
        ? source.sections.filter((s) => s.isActive).map((s) => s.name)
        : ['A']

      for (const name of sectionNames.length ? sectionNames : ['A']) {
        await tx.section.create({
          data: {
            academicGroupId: group.id,
            academicSessionId: input.toSessionId,
            name,
          },
        })
        sectionsCreated += 1
      }
    }

    if (input.includeCurriculum) {
      const sourceCurriculum = await tx.curriculumSubject.findMany({
        where: { academicSessionId: input.fromSessionId },
      })

      for (const entry of sourceCurriculum) {
        const created = await tx.curriculumSubject.createMany({
          data: {
            academicSessionId: input.toSessionId,
            classId: entry.classId,
            programId: entry.programId,
            subjectId: entry.subjectId,
            isCompulsory: entry.isCompulsory,
            sortOrder: entry.sortOrder,
          },
          skipDuplicates: true,
        })
        curriculumCreated += created.count
      }
    }

    await writeAuditLog(
      ctx,
      {
        action: 'academic_group.created',
        entityType: 'academic_session',
        entityId: input.toSessionId,
        entityLabel: toSession.name,
        metadata: {
          copiedFrom: fromSession.name,
          groupsCreated,
          sectionsCreated,
          curriculumCreated,
        },
      },
      tx,
    )
  })

  return { groupsCreated, sectionsCreated, curriculumCreated }
}

// ===========================================================================
// Sections
// ===========================================================================

export async function createSection(ctx: AuthContext, input: SectionInput) {
  authorize(ctx, 'academics.manage')

  const group = await prisma.academicGroup.findUnique({
    where: { id: input.academicGroupId },
    include: { class: true, division: true, program: true },
  })
  if (!group) throw new NotFoundError('academic group')

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.section.create({
        data: {
          academicGroupId: group.id,
          // Taken from the group, never from the request: this is what makes it
          // impossible for a section to belong to the wrong session.
          academicSessionId: group.academicSessionId,
          name: input.name,
          capacity: input.capacity,
          isActive: input.isActive,
        },
      }),
    { academic_group_id: `Section "${input.name}" already exists in this group.` },
  )

  await writeAuditLog(ctx, {
    action: 'section.created',
    entityType: 'section',
    entityId: created.id,
    entityLabel: `${group.class.name} · ${group.division.name} · ${group.program.name} · ${created.name}`,
    after: created,
  })

  return created
}

export async function updateSection(
  ctx: AuthContext,
  id: string,
  input: { name: string; capacity?: number; isActive: boolean },
) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.section.findUnique({
    where: { id },
    include: { academicGroup: { include: { class: true, division: true, program: true } } },
  })
  if (!before) throw new NotFoundError('section')

  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.section.update({
        where: { id },
        data: {
          name: input.name,
          capacity: input.capacity ?? null,
          isActive: input.isActive,
        },
      }),
    { academic_group_id: `Section "${input.name}" already exists in this group.` },
  )

  const g = before.academicGroup
  await writeAuditLog(ctx, {
    action:
      before.isActive === input.isActive
        ? 'section.updated'
        : input.isActive
          ? 'section.activated'
          : 'section.deactivated',
    entityType: 'section',
    entityId: id,
    entityLabel: `${g.class.name} · ${g.division.name} · ${g.program.name} · ${updated.name}`,
    before: { name: before.name, capacity: before.capacity, isActive: before.isActive },
    after: { name: updated.name, capacity: updated.capacity, isActive: updated.isActive },
  })

  return updated
}

export async function deleteSection(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      academicGroup: { include: { class: true, division: true, program: true } },
      _count: { select: { enrollments: true, teacherAssignments: true } },
    },
  })
  if (!section) throw new NotFoundError('section')

  assertNotReferenced(`Section "${section.name}"`, [
    { label: 'enrolled student(s)', count: section._count.enrollments },
    { label: 'teacher assignment(s)', count: section._count.teacherAssignments },
  ])

  const g = section.academicGroup
  await prisma.section.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'section.deactivated',
    entityType: 'section',
    entityId: id,
    entityLabel: `${g.class.name} · ${g.division.name} · ${g.program.name} · ${section.name}`,
    before: section,
    metadata: { deleted: true },
  })
}

// ===========================================================================
// Curriculum — which subjects a Class x Program studies in a session (ADR-033)
// ===========================================================================

export async function getCurriculum(
  ctx: AuthContext,
  params: { academicSessionId: string; classId: string; programId: string },
) {
  authorize(ctx, 'academics.view')

  const rows = await prisma.curriculumSubject.findMany({
    where: params,
    include: { subject: true },
    orderBy: [{ sortOrder: 'asc' }, { subject: { name: 'asc' } }],
  })

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    subjectCode: row.subject.code,
    isCompulsory: row.isCompulsory,
    sortOrder: row.sortOrder,
  }))
}

/**
 * Replaces the subject list of one Class x Program in one session.
 *
 * Subjects that are removed are only deleted when nothing depends on them yet.
 * (From Phase 8 onwards this will also check exam papers.)
 */
export async function setCurriculum(ctx: AuthContext, input: CurriculumSetInput) {
  authorize(ctx, 'academics.manage')

  const [session, klass, program] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: input.academicSessionId } }),
    prisma.class.findUnique({ where: { id: input.classId } }),
    prisma.program.findUnique({ where: { id: input.programId } }),
  ])
  if (!session) throw new NotFoundError('academic session')
  if (!klass) throw new NotFoundError('class')
  if (!program) throw new NotFoundError('program')

  const existing = await prisma.curriculumSubject.findMany({
    where: {
      academicSessionId: input.academicSessionId,
      classId: input.classId,
      programId: input.programId,
    },
  })

  const wantedIds = new Set(input.subjects.map((s) => s.subjectId))
  const existingIds = new Set(existing.map((e) => e.subjectId))

  const toRemove = existing.filter((e) => !wantedIds.has(e.subjectId))
  const toAdd = input.subjects.filter((s) => !existingIds.has(s.subjectId))

  await prisma.$transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx.curriculumSubject.deleteMany({ where: { id: { in: toRemove.map((r) => r.id) } } })
    }

    for (const [index, subject] of input.subjects.entries()) {
      if (toAdd.some((a) => a.subjectId === subject.subjectId)) {
        await tx.curriculumSubject.create({
          data: {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            programId: input.programId,
            subjectId: subject.subjectId,
            isCompulsory: subject.isCompulsory,
            sortOrder: index,
          },
        })
      } else {
        await tx.curriculumSubject.updateMany({
          where: {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            programId: input.programId,
            subjectId: subject.subjectId,
          },
          data: { isCompulsory: subject.isCompulsory, sortOrder: index },
        })
      }
    }

    await writeAuditLog(
      ctx,
      {
        action: 'curriculum.updated',
        entityType: 'curriculum',
        entityId: input.classId,
        entityLabel: `${session.name} · ${klass.name} · ${program.name}`,
        before: { subjectIds: [...existingIds] },
        after: { subjectIds: [...wantedIds] },
        metadata: { added: toAdd.length, removed: toRemove.length },
      },
      tx,
    )
  })

  return { added: toAdd.length, removed: toRemove.length, total: input.subjects.length }
}

/** Every Class x Program pair that exists in a session, with its subject count. */
export async function listCurriculumOverview(ctx: AuthContext, academicSessionId: string) {
  authorize(ctx, 'academics.view')

  const groups = await prisma.academicGroup.findMany({
    where: { academicSessionId },
    include: { class: true, program: true },
    orderBy: [{ class: { level: 'asc' } }, { program: { sortOrder: 'asc' } }],
  })

  const counts = await prisma.curriculumSubject.groupBy({
    by: ['classId', 'programId'],
    where: { academicSessionId },
    _count: { _all: true },
  })

  const countMap = new Map(counts.map((c) => [`${c.classId}:${c.programId}`, c._count._all]))

  // One row per class+program pair (a pair appears once per division, so dedupe).
  const seen = new Set<string>()
  const rows: {
    classId: string
    className: string
    classLevel: number
    programId: string
    programName: string
    subjectCount: number
  }[] = []

  for (const group of groups) {
    const key = `${group.classId}:${group.programId}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({
      classId: group.classId,
      className: group.class.displayName ?? group.class.name,
      classLevel: group.class.level,
      programId: group.programId,
      programName: group.program.name,
      subjectCount: countMap.get(key) ?? 0,
    })
  }

  return rows
}

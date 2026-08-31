/**
 * The academic "building blocks": classes, divisions, programs and subjects.
 *
 * These are ordinary database rows the Admin manages from the portal. Nothing in
 * the application's logic knows the words "Pre-Medical", "Boys" or "1st Year" —
 * they are seeded as starting data and can be renamed, deactivated or joined by
 * new ones at any time, with no code change (requirements 4–8).
 *
 * Every function takes an AuthContext and checks permission first (ADR-008).
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { NotFoundError } from '../api/errors'
import {
  assertNotReferenced,
  paginate,
  paginatedResult,
  withUniqueConstraintHandling,
  type PaginatedResult,
} from './service-utils'
import type { ClassInput, DivisionInput, ProgramInput, SubjectInput } from '@/validation/academics'
import type { ListQuery } from '@/validation/common'

// ===========================================================================
// Classes / years
// ===========================================================================

export interface ClassRecord {
  id: string
  name: string
  displayName: string | null
  code: string
  level: number
  isActive: boolean
  groupCount: number
}

export async function listClasses(
  ctx: AuthContext,
  query: Partial<ListQuery> = {},
): Promise<ClassRecord[]> {
  authorize(ctx, 'academics.view')

  const rows = await prisma.class.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { academicGroups: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    code: row.code,
    level: row.level,
    isActive: row.isActive,
    groupCount: row._count.academicGroups,
  }))
}

export async function createClass(ctx: AuthContext, input: ClassInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.class.create({ data: input }),
    {
      name: 'A class with this name already exists.',
      code: 'A class with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'class.created',
    entityType: 'class',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateClass(ctx: AuthContext, id: string, input: ClassInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.class.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('class')

  const updated = await withUniqueConstraintHandling(
    () => prisma.class.update({ where: { id }, data: input }),
    {
      name: 'A class with this name already exists.',
      code: 'A class with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: input.isActive === before.isActive ? 'class.updated' : input.isActive ? 'class.activated' : 'class.deactivated',
    entityType: 'class',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setClassActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.class.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('class')

  const updated = await prisma.class.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'class.activated' : 'class.deactivated',
    entityType: 'class',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function deleteClass(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.class.findUnique({
    where: { id },
    include: { _count: { select: { academicGroups: true, curriculumSubjects: true } } },
  })
  if (!record) throw new NotFoundError('class')

  assertNotReferenced(`The class "${record.name}"`, [
    { label: 'academic group(s)', count: record._count.academicGroups },
    { label: 'curriculum entr(ies)', count: record._count.curriculumSubjects },
  ])

  await prisma.class.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'class.updated',
    entityType: 'class',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

// ===========================================================================
// Divisions
// ===========================================================================

export async function listDivisions(ctx: AuthContext, query: Partial<ListQuery> = {}) {
  authorize(ctx, 'academics.view')

  const rows = await prisma.division.findMany({
    where: query.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { academicGroups: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    groupCount: row._count.academicGroups,
  }))
}

export async function createDivision(ctx: AuthContext, input: DivisionInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.division.create({ data: input }),
    {
      name: 'A division with this name already exists.',
      code: 'A division with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'division.created',
    entityType: 'division',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateDivision(ctx: AuthContext, id: string, input: DivisionInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.division.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('division')

  const updated = await withUniqueConstraintHandling(
    () => prisma.division.update({ where: { id }, data: input }),
    {
      name: 'A division with this name already exists.',
      code: 'A division with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'division.updated',
    entityType: 'division',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setDivisionActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.division.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('division')

  const updated = await prisma.division.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'division.activated' : 'division.deactivated',
    entityType: 'division',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function deleteDivision(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.division.findUnique({
    where: { id },
    include: { _count: { select: { academicGroups: true } } },
  })
  if (!record) throw new NotFoundError('division')

  assertNotReferenced(`The division "${record.name}"`, [
    { label: 'academic group(s)', count: record._count.academicGroups },
  ])

  await prisma.division.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'division.updated',
    entityType: 'division',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

// ===========================================================================
// Programs  ("groups" in college language: Pre-Medical, ICS Physics, FAIT, …)
// ===========================================================================

export interface ProgramRecord {
  id: string
  name: string
  code: string
  description: string | null
  sortOrder: number
  isActive: boolean
  groupCount: number
}

export async function listPrograms(
  ctx: AuthContext,
  query: Partial<ListQuery> = {},
): Promise<ProgramRecord[]> {
  authorize(ctx, 'academics.view')

  const rows = await prisma.program.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { academicGroups: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    groupCount: row._count.academicGroups,
  }))
}

export async function createProgram(ctx: AuthContext, input: ProgramInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.program.create({ data: input }),
    {
      name: 'A program with this name already exists.',
      code: 'A program with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'program.created',
    entityType: 'program',
    entityId: created.id,
    entityLabel: `${created.name} (${created.code})`,
    after: created,
  })

  return created
}

export async function updateProgram(ctx: AuthContext, id: string, input: ProgramInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.program.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('program')

  const updated = await withUniqueConstraintHandling(
    () => prisma.program.update({ where: { id }, data: input }),
    {
      name: 'A program with this name already exists.',
      code: 'A program with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'program.updated',
    entityType: 'program',
    entityId: id,
    entityLabel: `${updated.name} (${updated.code})`,
    before,
    after: updated,
  })

  return updated
}

export async function setProgramActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.program.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('program')

  const updated = await prisma.program.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'program.activated' : 'program.deactivated',
    entityType: 'program',
    entityId: id,
    entityLabel: `${updated.name} (${updated.code})`,
    before,
    after: updated,
  })

  return updated
}

export async function deleteProgram(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.program.findUnique({
    where: { id },
    include: { _count: { select: { academicGroups: true, curriculumSubjects: true } } },
  })
  if (!record) throw new NotFoundError('program')

  assertNotReferenced(`The program "${record.name}"`, [
    { label: 'academic group(s)', count: record._count.academicGroups },
    { label: 'curriculum entr(ies)', count: record._count.curriculumSubjects },
  ])

  await prisma.program.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'program.updated',
    entityType: 'program',
    entityId: id,
    entityLabel: `${record.name} (${record.code})`,
    before: record,
    metadata: { deleted: true },
  })
}

// ===========================================================================
// Subjects
// ===========================================================================

export async function listSubjects(
  ctx: AuthContext,
  query: Partial<ListQuery> = {},
): Promise<PaginatedResult<{
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  curriculumCount: number
}>> {
  authorize(ctx, 'academics.view')

  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50

  const where = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { curriculumSubjects: true } } },
      ...paginate(page, pageSize),
    }),
    prisma.subject.count({ where }),
  ])

  return paginatedResult(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.isActive,
      curriculumCount: row._count.curriculumSubjects,
    })),
    total,
    page,
    pageSize,
  )
}

export async function createSubject(ctx: AuthContext, input: SubjectInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.subject.create({ data: input }),
    {
      name: 'A subject with this name already exists.',
      code: 'A subject with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'subject.created',
    entityType: 'subject',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateSubject(ctx: AuthContext, id: string, input: SubjectInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.subject.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('subject')

  const updated = await withUniqueConstraintHandling(
    () => prisma.subject.update({ where: { id }, data: input }),
    {
      name: 'A subject with this name already exists.',
      code: 'A subject with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'subject.updated',
    entityType: 'subject',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setSubjectActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.subject.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('subject')

  const updated = await prisma.subject.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'subject.activated' : 'subject.deactivated',
    entityType: 'subject',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function deleteSubject(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.subject.findUnique({
    where: { id },
    include: { _count: { select: { curriculumSubjects: true, teacherAssignments: true } } },
  })
  if (!record) throw new NotFoundError('subject')

  assertNotReferenced(`The subject "${record.name}"`, [
    { label: 'curriculum entr(ies)', count: record._count.curriculumSubjects },
    { label: 'teacher assignment(s)', count: record._count.teacherAssignments },
  ])

  await prisma.subject.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'subject.updated',
    entityType: 'subject',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

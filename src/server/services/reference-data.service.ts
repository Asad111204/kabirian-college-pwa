/**
 * Designations and departments — the reference lists behind a staff record.
 *
 * They behave exactly like classes, divisions and programs: rows the Admin
 * manages, never values written into the code. A college that invents a new job
 * title adds it here and it is immediately selectable.
 *
 * The same delete-versus-deactivate rule applies (ADR-043): anything already in
 * use cannot be removed, only deactivated, so historical records stay readable.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { NotFoundError } from '../api/errors'
import { assertNotReferenced, withUniqueConstraintHandling } from './service-utils'
import type { z } from 'zod'
import type { departmentCreateSchema, designationCreateSchema } from '@/validation/staff'

type DesignationInput = z.infer<typeof designationCreateSchema>
type DepartmentInput = z.infer<typeof departmentCreateSchema>

/* -------------------------------------------------------------------------- */
/* Designations                                                               */
/* -------------------------------------------------------------------------- */

export async function listDesignations(
  ctx: AuthContext,
  options: { includeInactive?: boolean } = {},
) {
  authorize(ctx, 'academics.view')

  const rows = await prisma.designation.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { staff: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    isTeaching: row.isTeaching,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    staffCount: row._count.staff,
  }))
}

export async function createDesignation(ctx: AuthContext, input: DesignationInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.designation.create({ data: input }),
    {
      name: 'A designation with this name already exists.',
      code: 'A designation with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'designation.created',
    entityType: 'designation',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateDesignation(ctx: AuthContext, id: string, input: DesignationInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.designation.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('designation')

  const updated = await withUniqueConstraintHandling(
    () => prisma.designation.update({ where: { id }, data: input }),
    {
      name: 'A designation with this name already exists.',
      code: 'A designation with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'designation.updated',
    entityType: 'designation',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setDesignationActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.designation.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('designation')

  const updated = await prisma.designation.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'designation.activated' : 'designation.deactivated',
    entityType: 'designation',
    entityId: id,
    entityLabel: updated.name,
    before: { isActive: before.isActive },
    after: { isActive },
  })

  return updated
}

export async function deleteDesignation(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.designation.findUnique({
    where: { id },
    include: { _count: { select: { staff: true } } },
  })
  if (!record) throw new NotFoundError('designation')

  assertNotReferenced(`The designation "${record.name}"`, [
    { label: 'staff member(s)', count: record._count.staff },
  ])

  await prisma.designation.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'designation.updated',
    entityType: 'designation',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

/* -------------------------------------------------------------------------- */
/* Departments                                                                */
/* -------------------------------------------------------------------------- */

export async function listDepartments(
  ctx: AuthContext,
  options: { includeInactive?: boolean } = {},
) {
  authorize(ctx, 'academics.view')

  const rows = await prisma.department.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { staff: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    staffCount: row._count.staff,
  }))
}

export async function createDepartment(ctx: AuthContext, input: DepartmentInput) {
  authorize(ctx, 'academics.manage')

  const created = await withUniqueConstraintHandling(
    () => prisma.department.create({ data: input }),
    {
      name: 'A department with this name already exists.',
      code: 'A department with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'department.created',
    entityType: 'department',
    entityId: created.id,
    entityLabel: created.name,
    after: created,
  })

  return created
}

export async function updateDepartment(ctx: AuthContext, id: string, input: DepartmentInput) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.department.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('department')

  const updated = await withUniqueConstraintHandling(
    () => prisma.department.update({ where: { id }, data: input }),
    {
      name: 'A department with this name already exists.',
      code: 'A department with this code already exists.',
    },
  )

  await writeAuditLog(ctx, {
    action: 'department.updated',
    entityType: 'department',
    entityId: id,
    entityLabel: updated.name,
    before,
    after: updated,
  })

  return updated
}

export async function setDepartmentActive(ctx: AuthContext, id: string, isActive: boolean) {
  authorize(ctx, 'academics.manage')

  const before = await prisma.department.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('department')

  const updated = await prisma.department.update({ where: { id }, data: { isActive } })

  await writeAuditLog(ctx, {
    action: isActive ? 'department.activated' : 'department.deactivated',
    entityType: 'department',
    entityId: id,
    entityLabel: updated.name,
    before: { isActive: before.isActive },
    after: { isActive },
  })

  return updated
}

export async function deleteDepartment(ctx: AuthContext, id: string) {
  authorize(ctx, 'academics.manage')

  const record = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { staff: true } } },
  })
  if (!record) throw new NotFoundError('department')

  assertNotReferenced(`The department "${record.name}"`, [
    { label: 'staff member(s)', count: record._count.staff },
  ])

  await prisma.department.delete({ where: { id } })
  await writeAuditLog(ctx, {
    action: 'department.updated',
    entityType: 'department',
    entityId: id,
    entityLabel: record.name,
    before: record,
    metadata: { deleted: true },
  })
}

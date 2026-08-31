/**
 * User & account management (Admin only).
 *
 * Everything here goes through the same rules as the rest of the system:
 *   authorize(ctx, ...) -> safety checks -> change -> audit entry
 *
 * Passwords are never returned, logged or audited. The only moment a temporary
 * password exists in readable form is the single API response that creates or
 * resets it, so the administrator can hand it over.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, NotFoundError, ValidationError } from '../api/errors'
import { generateTemporaryPassword, hashPassword } from '../auth/password'
import { invalidateAllUserSessions } from '../auth/session'
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  resolveEffectivePermissions,
} from '../auth/permissions'
import {
  assertCanChangePermissions,
  assertCanChangeRole,
  assertCanChangeStatus,
  assertCanResetPassword,
  type SafetyContext,
  type UserSafetySubject,
} from './user-safety'
import { paginate, paginatedResult, withUniqueConstraintHandling, type PaginatedResult } from './service-utils'
import type { UserRole, UserStatus } from '@/generated/prisma/enums'
import type {
  UserCreateInput,
  UserListQuery,
  UserPermissionsInput,
  UserUpdateInput,
} from '@/validation/users'

/* -------------------------------------------------------------------------- */
/* Shapes returned to the browser                                             */
/* -------------------------------------------------------------------------- */

export interface UserListItem {
  id: string
  username: string
  displayName: string
  email: string | null
  role: UserRole
  status: UserStatus
  isLocked: boolean
  lockedUntil: Date | null
  mustChangePassword: boolean
  isSystemOwner: boolean
  lastLoginAt: Date | null
  createdAt: Date
  /** The staff or student record this account belongs to, if any. */
  profile: { type: 'STAFF' | 'STUDENT'; id: string; name: string; code: string } | null
}

export interface UserDetail extends UserListItem {
  activeSessionCount: number
  passwordChangedAt: Date | null
  failedLoginAttempts: number
}

/** What the browser needs to draw the permission editor for one user. */
export interface UserPermissionsView {
  role: UserRole
  modules: {
    module: string
    permissions: {
      key: string
      description: string
      fromRole: boolean
      override: 'GRANT' | 'REVOKE' | null
      effective: boolean
    }[]
  }[]
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Prisma `include` used everywhere a user is read, so shapes stay consistent. */
const userInclude = {
  staff: { select: { id: true, fullName: true, staffCode: true } },
  student: { select: { id: true, fullName: true, studentCode: true } },
} as const

type UserWithProfiles = {
  id: string
  username: string
  fullName: string | null
  email: string | null
  role: UserRole
  status: UserStatus
  lockedUntil: Date | null
  mustChangePassword: boolean
  isSystemOwner: boolean
  lastLoginAt: Date | null
  createdAt: Date
  staff: { id: string; fullName: string; staffCode: string } | null
  student: { id: string; fullName: string; studentCode: string } | null
}

function toListItem(user: UserWithProfiles): UserListItem {
  const profile = user.staff
    ? { type: 'STAFF' as const, id: user.staff.id, name: user.staff.fullName, code: user.staff.staffCode }
    : user.student
      ? { type: 'STUDENT' as const, id: user.student.id, name: user.student.fullName, code: user.student.studentCode }
      : null

  return {
    id: user.id,
    username: user.username,
    // A linked profile is authoritative; full_name covers administrators.
    displayName: profile?.name ?? user.fullName ?? user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    isLocked: user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now(),
    lockedUntil: user.lockedUntil,
    mustChangePassword: user.mustChangePassword,
    isSystemOwner: user.isSystemOwner,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    profile,
  }
}

function toSafetySubject(user: UserWithProfiles): UserSafetySubject {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    isSystemOwner: user.isSystemOwner,
  }
}

/** How many administrators could still sign in right now. */
async function countActiveAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
}

async function safetyContext(ctx: AuthContext): Promise<SafetyContext> {
  return { actorUserId: ctx.userId, activeAdminCount: await countActiveAdmins() }
}

async function loadUser(id: string): Promise<UserWithProfiles> {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
  if (!user) throw new NotFoundError('user account')
  return user
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listUsers(
  ctx: AuthContext,
  query: UserListQuery,
): Promise<PaginatedResult<UserListItem> & { counts: Record<string, number> }> {
  authorize(ctx, 'users.view')

  const now = new Date()

  const where = {
    ...(query.role !== 'ALL' ? { role: query.role } : {}),
    ...(query.status === 'LOCKED'
      ? { lockedUntil: { gt: now } }
      : query.status !== 'ALL'
        ? { status: query.status }
        : {}),
    ...(query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' as const } },
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { staff: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
            { student: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  // Sorting is limited to a fixed list of columns — the client cannot ask us to
  // order by an arbitrary field.
  const orderBy =
    query.sort === 'username'
      ? { username: query.direction }
      : query.sort === 'lastLoginAt'
        ? { lastLoginAt: query.direction }
        : query.sort === 'role'
          ? { role: query.direction }
          : { createdAt: query.direction }

  const [rows, total, adminCount, staffCount, studentCount, activeCount, lockedCount] =
    await Promise.all([
      prisma.user.findMany({
        where,
        include: userInclude,
        orderBy,
        ...paginate(query.page, query.pageSize),
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'STAFF' } }),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    ])

  return {
    ...paginatedResult(rows.map(toListItem), total, query.page, query.pageSize),
    counts: {
      admin: adminCount,
      staff: staffCount,
      student: studentCount,
      active: activeCount,
      locked: lockedCount,
      all: adminCount + staffCount + studentCount,
    },
  }
}

export async function getUser(ctx: AuthContext, id: string): Promise<UserDetail> {
  authorize(ctx, 'users.view')

  const user = await loadUser(id)
  const [activeSessionCount, extra] = await Promise.all([
    prisma.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
    prisma.user.findUnique({
      where: { id },
      select: { passwordChangedAt: true, failedLoginAttempts: true },
    }),
  ])

  return {
    ...toListItem(user),
    activeSessionCount,
    passwordChangedAt: extra?.passwordChangedAt ?? null,
    failedLoginAttempts: extra?.failedLoginAttempts ?? 0,
  }
}

/**
 * Staff and student records that do not yet have a login account.
 * Used by the "link to an existing record" picker when creating an account.
 */
export async function listUnlinkedProfiles(ctx: AuthContext, search?: string) {
  authorize(ctx, 'users.view')

  const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined

  const [staff, students] = await Promise.all([
    prisma.staff.findMany({
      where: {
        userId: null,
        deletedAt: null,
        ...(contains ? { OR: [{ fullName: contains }, { staffCode: contains }] } : {}),
      },
      select: { id: true, fullName: true, staffCode: true, designation: true },
      orderBy: { fullName: 'asc' },
      take: 50,
    }),
    prisma.student.findMany({
      where: {
        userId: null,
        deletedAt: null,
        ...(contains ? { OR: [{ fullName: contains }, { studentCode: contains }] } : {}),
      },
      select: { id: true, fullName: true, studentCode: true },
      orderBy: { fullName: 'asc' },
      take: 50,
    }),
  ])

  return {
    staff: staff.map((s) => ({ id: s.id, name: s.fullName, code: s.staffCode, detail: s.designation })),
    students: students.map((s) => ({ id: s.id, name: s.fullName, code: s.studentCode, detail: null })),
  }
}

/* -------------------------------------------------------------------------- */
/* Creating                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreatedUserResult {
  user: UserListItem
  /**
   * Shown to the administrator once, in the response to this call only.
   * It is never stored in readable form, never logged and never audited.
   */
  temporaryPassword: string
}

export async function createUser(
  ctx: AuthContext,
  input: UserCreateInput,
): Promise<CreatedUserResult> {
  authorize(ctx, 'users.manage')

  // Username uniqueness is case-insensitive, which a plain unique index would
  // not catch on its own — the database has a lower(username) index too.
  const existing = await prisma.user.findFirst({
    where: { username: { equals: input.username, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) {
    throw new ConflictError('That username is already taken.', {
      username: ['That username is already taken.'],
    })
  }

  // If a profile was chosen, check it exists and is not already linked.
  if (input.staffId) {
    const staff = await prisma.staff.findUnique({
      where: { id: input.staffId },
      select: { id: true, userId: true, fullName: true },
    })
    if (!staff) throw new NotFoundError('staff record')
    if (staff.userId) {
      throw new ConflictError(`${staff.fullName} already has a login account.`, {
        staffId: ['This staff member already has an account.'],
      })
    }
  }

  if (input.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, userId: true, fullName: true },
    })
    if (!student) throw new NotFoundError('student record')
    if (student.userId) {
      throw new ConflictError(`${student.fullName} already has a login account.`, {
        studentId: ['This student already has an account.'],
      })
    }
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: input.username,
            fullName: input.fullName,
            email: input.email ?? null,
            passwordHash,
            role: input.role,
            status: input.status,
            // Always true: the administrator knows this password, so the person
            // must replace it with one only they know.
            mustChangePassword: true,
          },
        })

        if (input.staffId) {
          await tx.staff.update({ where: { id: input.staffId }, data: { userId: user.id } })
        }
        if (input.studentId) {
          await tx.student.update({ where: { id: input.studentId }, data: { userId: user.id } })
        }

        await writeAuditLog(
          ctx,
          {
            action: 'user.created',
            entityType: 'user',
            entityId: user.id,
            entityLabel: `${input.fullName} (${user.username})`,
            // Deliberately no password material of any kind.
            after: {
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              status: user.status,
            },
            metadata: {
              linkedStaffId: input.staffId ?? null,
              linkedStudentId: input.studentId ?? null,
            },
          },
          tx,
        )

        return user.id
      }),
    { username: 'That username is already taken.', email: 'That email address is already in use.' },
  )

  const user = await loadUser(created)
  return { user: toListItem(user), temporaryPassword }
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateUser(
  ctx: AuthContext,
  id: string,
  input: UserUpdateInput,
): Promise<UserListItem> {
  authorize(ctx, 'users.manage')

  const before = await loadUser(id)

  if (input.username !== before.username) {
    const clash = await prisma.user.findFirst({
      where: { username: { equals: input.username, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    })
    if (clash) {
      throw new ConflictError('That username is already taken.', {
        username: ['That username is already taken.'],
      })
    }
  }

  await withUniqueConstraintHandling(
    () =>
      prisma.user.update({
        where: { id },
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
        },
      }),
    { username: 'That username is already taken.', email: 'That email address is already in use.' },
  )

  await writeAuditLog(ctx, {
    action: 'user.updated',
    entityType: 'user',
    entityId: id,
    entityLabel: `${input.fullName} (${input.username})`,
    before: { username: before.username, fullName: before.fullName, email: before.email },
    after: { username: input.username, fullName: input.fullName, email: input.email ?? null },
  })

  return toListItem(await loadUser(id))
}

/* -------------------------------------------------------------------------- */
/* Account lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export async function setUserStatus(
  ctx: AuthContext,
  id: string,
  status: UserStatus,
): Promise<UserListItem> {
  authorize(ctx, 'users.manage')

  const target = await loadUser(id)
  assertCanChangeStatus(await safetyContext(ctx), toSafetySubject(target), status)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        status,
        // Reactivating clears a lockout, so the person is not blocked twice.
        ...(status === 'ACTIVE' ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
      },
    })

    // Deactivation must take effect immediately, not when the cookie expires.
    if (status === 'INACTIVE') {
      await tx.session.deleteMany({ where: { userId: id } })
    }

    await writeAuditLog(
      ctx,
      {
        action: status === 'ACTIVE' ? 'user.activated' : 'user.deactivated',
        entityType: 'user',
        entityId: id,
        entityLabel: `${target.fullName ?? target.username} (${target.username})`,
        before: { status: target.status },
        after: { status },
        metadata: status === 'INACTIVE' ? { sessionsRevoked: true } : undefined,
      },
      tx,
    )
  })

  return toListItem(await loadUser(id))
}

/** Clears a temporary lockout caused by repeated wrong passwords. */
export async function unlockUser(ctx: AuthContext, id: string): Promise<UserListItem> {
  authorize(ctx, 'users.manage')

  const target = await loadUser(id)

  await prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  })

  await writeAuditLog(ctx, {
    action: 'user.unlocked',
    entityType: 'user',
    entityId: id,
    entityLabel: target.username,
    before: { lockedUntil: target.lockedUntil },
  })

  return toListItem(await loadUser(id))
}

export async function changeUserRole(
  ctx: AuthContext,
  id: string,
  role: UserRole,
): Promise<UserListItem> {
  authorize(ctx, 'users.manage')

  const target = await loadUser(id)
  assertCanChangeRole(await safetyContext(ctx), toSafetySubject(target), role)

  // A role change alters what the person may do. Their existing overrides were
  // chosen against the old role, so keeping them could grant something
  // unintended — we clear them and record exactly what was removed.
  const existingOverrides = await prisma.userPermission.findMany({
    where: { userId: id },
    select: { permissionKey: true, effect: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { role } })

    if (existingOverrides.length > 0) {
      await tx.userPermission.deleteMany({ where: { userId: id } })
    }

    // Their permissions are now different, so make them sign in again.
    await tx.session.deleteMany({ where: { userId: id } })

    await writeAuditLog(
      ctx,
      {
        action: 'user.role_changed',
        entityType: 'user',
        entityId: id,
        entityLabel: `${target.fullName ?? target.username} (${target.username})`,
        before: { role: target.role },
        after: { role },
        metadata: {
          clearedOverrides: existingOverrides,
          sessionsRevoked: true,
        },
      },
      tx,
    )
  })

  return toListItem(await loadUser(id))
}

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

export interface ResetPasswordResult {
  temporaryPassword: string
  sessionsRevoked: number
}

export async function resetUserPassword(
  ctx: AuthContext,
  id: string,
): Promise<ResetPasswordResult> {
  authorize(ctx, 'users.manage')

  const target = await loadUser(id)
  assertCanResetPassword(await safetyContext(ctx), toSafetySubject(target))

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const sessionsRevoked = await prisma.session.count({ where: { userId: id } })

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })

    // The old password is gone, so every existing session must go with it.
    await tx.session.deleteMany({ where: { userId: id } })

    await writeAuditLog(
      ctx,
      {
        action: 'user.password_reset',
        entityType: 'user',
        entityId: id,
        entityLabel: `${target.fullName ?? target.username} (${target.username})`,
        // No password, no hash — only the fact that it happened.
        metadata: { sessionsRevoked, mustChangePassword: true },
      },
      tx,
    )
  })

  return { temporaryPassword, sessionsRevoked }
}

/** Signs a user out of every device without changing their password. */
export async function revokeUserSessions(ctx: AuthContext, id: string): Promise<number> {
  authorize(ctx, 'users.manage')

  const target = await loadUser(id)
  const count = await prisma.session.count({ where: { userId: id } })

  await invalidateAllUserSessions(id)

  await writeAuditLog(ctx, {
    action: 'user.sessions_revoked',
    entityType: 'user',
    entityId: id,
    entityLabel: target.username,
    metadata: { sessionsRevoked: count },
  })

  return count
}

/* -------------------------------------------------------------------------- */
/* Permission overrides                                                       */
/* -------------------------------------------------------------------------- */

export async function getUserPermissions(
  ctx: AuthContext,
  id: string,
): Promise<UserPermissionsView> {
  authorize(ctx, 'users.view')

  const user = await loadUser(id)
  const overrides = await prisma.userPermission.findMany({
    where: { userId: id },
    select: { permissionKey: true, effect: true },
  })

  const rolePermissions = new Set(ROLE_DEFAULT_PERMISSIONS[user.role] ?? [])
  const overrideMap = new Map(overrides.map((o) => [o.permissionKey, o.effect]))
  const effective = resolveEffectivePermissions([...rolePermissions], overrides)

  // Group by module so the editor can show "Students", "Attendance", … sections.
  const byModule = new Map<string, UserPermissionsView['modules'][number]['permissions']>()

  for (const key of ALL_PERMISSION_KEYS) {
    const meta = PERMISSIONS[key]
    const list = byModule.get(meta.module) ?? []
    list.push({
      key,
      description: meta.description,
      fromRole: rolePermissions.has(key),
      override: overrideMap.get(key) ?? null,
      effective: effective.has(key),
    })
    byModule.set(meta.module, list)
  }

  return {
    role: user.role,
    modules: [...byModule.entries()].map(([module, permissions]) => ({ module, permissions })),
  }
}

export async function setUserPermissions(
  ctx: AuthContext,
  id: string,
  input: UserPermissionsInput,
): Promise<UserPermissionsView> {
  authorize(ctx, 'permissions.manage')

  const target = await loadUser(id)

  // Reject unknown permission keys rather than silently storing rubbish.
  const unknown = input.overrides
    .map((o) => o.permissionKey)
    .filter((key) => !(ALL_PERMISSION_KEYS as string[]).includes(key))
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown permission: ${unknown.join(', ')}.`)
  }

  const revokedKeys = input.overrides.filter((o) => o.effect === 'REVOKE').map((o) => o.permissionKey)
  assertCanChangePermissions(await safetyContext(ctx), toSafetySubject(target), revokedKeys)

  /**
   * An override that matches the role default is pointless — it would look like
   * a deliberate exception when it changes nothing. We drop those so the stored
   * overrides always mean "different from the role".
   */
  const rolePermissions = new Set(ROLE_DEFAULT_PERMISSIONS[target.role] ?? [])
  const meaningful = input.overrides.filter((o) =>
    o.effect === 'GRANT' ? !rolePermissions.has(o.permissionKey as never) : rolePermissions.has(o.permissionKey as never),
  )

  const before = await prisma.userPermission.findMany({
    where: { userId: id },
    select: { permissionKey: true, effect: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: id } })

    if (meaningful.length > 0) {
      await tx.userPermission.createMany({
        data: meaningful.map((o) => ({
          userId: id,
          permissionKey: o.permissionKey,
          effect: o.effect,
          grantedByUserId: ctx.userId,
        })),
      })
    }

    const beforeKeys = new Map(before.map((o) => [o.permissionKey, o.effect]))
    const afterKeys = new Map(meaningful.map((o) => [o.permissionKey, o.effect]))

    const granted = meaningful.filter((o) => o.effect === 'GRANT' && beforeKeys.get(o.permissionKey) !== 'GRANT')
    const revoked = meaningful.filter((o) => o.effect === 'REVOKE' && beforeKeys.get(o.permissionKey) !== 'REVOKE')
    const removed = before.filter((o) => !afterKeys.has(o.permissionKey))

    const label = `${target.fullName ?? target.username} (${target.username})`

    if (granted.length > 0) {
      await writeAuditLog(
        ctx,
        {
          action: 'permission.granted',
          entityType: 'user',
          entityId: id,
          entityLabel: label,
          after: { granted: granted.map((o) => o.permissionKey) },
        },
        tx,
      )
    }
    if (revoked.length > 0) {
      await writeAuditLog(
        ctx,
        {
          action: 'permission.revoked',
          entityType: 'user',
          entityId: id,
          entityLabel: label,
          after: { revoked: revoked.map((o) => o.permissionKey) },
        },
        tx,
      )
    }
    if (removed.length > 0) {
      await writeAuditLog(
        ctx,
        {
          action: 'permission.override_removed',
          entityType: 'user',
          entityId: id,
          entityLabel: label,
          before: { removed: removed.map((o) => o.permissionKey) },
        },
        tx,
      )
    }
  })

  return getUserPermissions(ctx, id)
}

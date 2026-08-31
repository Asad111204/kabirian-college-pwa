/**
 * AuthContext — "who is asking?" — plus the guards that every protected page
 * and every API route uses.
 *
 * Rule for the whole project (ADR-008): authorization happens on the server,
 * inside services. Pages and routes obtain an AuthContext here and pass it down.
 */
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/generated/prisma/enums'
import { AuthenticationError, ForbiddenError } from '../api/errors'
import { ROLE_DEFAULT_PERMISSIONS, resolveEffectivePermissions } from './permissions'
import { readSessionCookie, validateSessionToken, type SessionUser } from './session'

export interface AuthContext {
  userId: string
  username: string
  fullName: string
  role: UserRole
  /** Set when the account belongs to a student. Their own record — nothing else. */
  studentId: string | null
  /** Set when the account belongs to a staff member. Drives teaching scope. */
  staffId: string | null
  isSystemOwner: boolean
  mustChangePassword: boolean
  sessionId: string
  permissions: Set<string>
}

function toAuthContext(user: SessionUser): AuthContext {
  const rolePermissions = ROLE_DEFAULT_PERMISSIONS[user.role] ?? []
  return {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    studentId: user.studentId,
    staffId: user.staffId,
    isSystemOwner: user.isSystemOwner,
    mustChangePassword: user.mustChangePassword,
    sessionId: user.sessionId,
    permissions: resolveEffectivePermissions(rolePermissions, user.permissionOverrides),
  }
}

/**
 * Reads the current user, or null when signed out.
 * `cache()` means several components in one render share a single lookup.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const token = await readSessionCookie()
  if (!token) return null

  const user = await validateSessionToken(token)
  if (!user) return null

  return toAuthContext(user)
})

/** For API routes: throws 401 instead of redirecting. */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) throw new AuthenticationError()
  return ctx
}

/** Where each role lands after signing in. */
export function portalPathForRole(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'STAFF':
      return '/staff'
    case 'STUDENT':
      return '/student'
    default:
      return '/'
  }
}

/**
 * For pages: guarantees a signed-in user with one of the allowed roles,
 * otherwise redirects. This runs on the server, so it cannot be bypassed by
 * editing the URL or disabling JavaScript.
 */
export async function requirePortalAccess(allowedRoles: UserRole[]): Promise<AuthContext> {
  const ctx = await getAuthContext()

  if (!ctx) redirect('/login')

  // Force the password change before anything else can be used.
  if (ctx.mustChangePassword) redirect('/change-password')

  if (!allowedRoles.includes(ctx.role)) {
    // Signed in, but this is not their portal — send them to their own.
    redirect(portalPathForRole(ctx.role))
  }

  return ctx
}

/** Throws unless the user holds this permission. */
export function authorize(ctx: AuthContext, permission: string): void {
  if (!ctx.permissions.has(permission)) {
    throw new ForbiddenError('You do not have permission to do this.', {
      userId: ctx.userId,
      role: ctx.role,
      requiredPermission: permission,
    })
  }
}

export function can(ctx: AuthContext | null, permission: string): boolean {
  return ctx?.permissions.has(permission) ?? false
}

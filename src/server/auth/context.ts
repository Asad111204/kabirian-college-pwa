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
import { portalPathFor, portalsFor, resolveActivePortal } from './portals'
import { readSessionCookie, validateSessionToken, type SessionUser } from './session'
import { headers } from 'next/headers'

export interface AuthContext {
  userId: string
  username: string
  fullName: string
  /**
   * The portal this request is working in — which is what every check in the
   * codebase means by "their role". For all but a staff member who also holds
   * office access (Phase 24), it is simply the account's role.
   */
  role: UserRole
  /** The account's own role, whatever portal it is currently working in. */
  accountRole: UserRole
  /** Office access held in addition to STAFF (Phase 24). */
  adminAccess: boolean
  /** Every portal this account may work in; one entry for almost everybody. */
  portals: UserRole[]
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
  // The portal they are in decides what they may do: a principal working in
  // the staff portal is a teacher, with a teacher's permissions and a
  // teacher's scope; the same person in the office portal is the office.
  // Nothing else in the codebase had to learn about two-portal accounts.
  const account = { role: user.role, adminAccess: user.adminAccess }
  const active = resolveActivePortal(account, user.activeRole)
  const rolePermissions = ROLE_DEFAULT_PERMISSIONS[active] ?? []
  return {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    role: active,
    accountRole: user.role,
    adminAccess: user.adminAccess,
    portals: portalsFor(account),
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

/** Where each role lands after signing in. Kept here for its many callers. */
export const portalPathForRole = portalPathFor

/**
 * The path being rendered, when the framework tells us. Used only to send
 * somebody back where they were going after switching portals.
 */
async function currentPath(): Promise<string | null> {
  try {
    const list = await headers()
    const url = list.get('x-invoke-path') ?? list.get('x-matched-path') ?? list.get('next-url') ?? null
    if (url && url.startsWith('/') && !url.startsWith('//')) return url
    return null
  } catch {
    return null
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
    // Somebody who holds this portal but is currently working in the other one
    // is offered the change rather than bounced: a bookmark into the office
    // should not silently land a principal back in the staff portal. The
    // switch is a POST on the next page, never a side effect of loading this
    // one.
    const switchable = allowedRoles.find((role) => ctx.portals.includes(role))
    if (switchable) {
      const next = await currentPath()
      redirect(`/switch?to=${switchable}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
    }
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

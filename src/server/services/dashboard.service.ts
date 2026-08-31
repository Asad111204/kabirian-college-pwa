/**
 * Admin dashboard data.
 *
 * One service gathers everything the dashboard shows, so the page itself has no
 * database queries in it and the same figures can be served over the API.
 *
 * Two things this file is careful about:
 *
 *  1. **Efficiency.** The database is asked as few times as possible: all six
 *     user figures come from a single GROUP BY, and the remaining counts are
 *     sent as one batched transaction rather than a dozen separate round trips.
 *     Nothing loads whole tables — every figure is a COUNT or an aggregate.
 *
 *  2. **Honesty.** Only modules that exist contribute numbers. Attendance,
 *     exams, results, documents and notices are listed as "not built yet"
 *     rather than reported as zero (see UPCOMING_MODULES).
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ForbiddenError } from '../api/errors'
import { listAcademicGroups } from './academic-structure.service'
import {
  buildQuickActions,
  buildStructureTree,
  describeAuditEntry,
  summariseUserCounts,
  UPCOMING_MODULES,
  type ActivityItem,
  type QuickActionDefinition,
  type StructureClassNode,
  type UpcomingModule,
  type UserStatistics,
} from './dashboard-helpers'

export interface AcademicStatistics {
  classes: number
  divisions: number
  programs: number
  subjects: number
  /** Groups and sections belong to the current session only. */
  academicGroups: number
  sections: number
  curriculumEntries: number
}

export interface PeopleStatistics {
  students: number
  staff: number
  studentsEnrolledThisSession: number
}

export interface CurrentSessionInfo {
  id: string
  name: string
  startDate: Date
  endDate: Date
  status: string
}

export interface AdminDashboardData {
  generatedAt: Date
  currentSession: CurrentSessionInfo | null
  totalSessions: number

  /** Present only when the administrator may view user accounts. */
  users: UserStatistics | null
  /** Present only when the administrator may view the academic structure. */
  academics: AcademicStatistics | null
  structure: StructureClassNode[] | null
  people: PeopleStatistics | null
  /** Present only when the administrator may view the audit log. */
  recentActivity: ActivityItem[] | null

  quickActions: QuickActionDefinition[]
  upcomingModules: UpcomingModule[]
}

/**
 * Builds the whole dashboard.
 *
 * Sections appear according to what this administrator is permitted to see, so
 * an admin whose `audit.view` was revoked simply gets no Recent Activity card
 * rather than an error.
 */
export async function getAdminDashboard(ctx: AuthContext): Promise<AdminDashboardData> {
  authorize(ctx, 'dashboard.view')

  // This is the ADMIN dashboard specifically. Staff and students have their own
  // portals, and `dashboard.view` alone must not open this one.
  if (ctx.role !== 'ADMIN') {
    throw new ForbiddenError('The admin dashboard is only available to administrators.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const canSeeUsers = ctx.permissions.has('users.view')
  const canSeeAcademics = ctx.permissions.has('academics.view')
  const canSeeAudit = ctx.permissions.has('audit.view')

  const currentSession = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  })

  /**
   * One batched round trip for every simple count. `$transaction` with an array
   * sends them together, which matters a lot against a hosted database where
   * the network round trip costs far more than the query itself.
   */
  const [
    totalSessions,
    classes,
    divisions,
    programs,
    subjects,
    academicGroups,
    sections,
    curriculumEntries,
    students,
    staff,
    studentsEnrolledThisSession,
  ] = await prisma.$transaction([
    prisma.academicSession.count(),
    prisma.class.count({ where: { isActive: true } }),
    prisma.division.count({ where: { isActive: true } }),
    prisma.program.count({ where: { isActive: true } }),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.academicGroup.count(
      currentSession ? { where: { academicSessionId: currentSession.id } } : undefined,
    ),
    prisma.section.count(
      currentSession ? { where: { academicSessionId: currentSession.id } } : undefined,
    ),
    prisma.curriculumSubject.count(
      currentSession ? { where: { academicSessionId: currentSession.id } } : undefined,
    ),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.staff.count({ where: { deletedAt: null } }),
    prisma.studentEnrollment.count(
      currentSession
        ? { where: { academicSessionId: currentSession.id, status: 'ACTIVE' } }
        : undefined,
    ),
  ])

  // Every user figure from a single grouped query: GROUP BY role, status.
  let users: UserStatistics | null = null
  if (canSeeUsers) {
    const grouped = await prisma.user.groupBy({
      by: ['role', 'status'],
      _count: { _all: true },
    })
    users = summariseUserCounts(grouped)
  }

  // The structure tree reuses the academic service rather than re-querying —
  // one source of truth for what a session's structure is.
  const structure =
    canSeeAcademics && currentSession
      ? buildStructureTree(await listAcademicGroups(ctx, currentSession.id))
      : canSeeAcademics
        ? []
        : null

  const recentActivity = canSeeAudit
    ? (
        await prisma.auditLog.findMany({
          // Sign-in noise would drown out the administrative changes that
          // actually matter on a dashboard.
          where: { action: { notIn: ['auth.login', 'auth.logout', 'auth.login_failed'] } },
          orderBy: { createdAt: 'desc' },
          take: 12,
          // Only the columns needed for a safe one-line summary. The before/after
          // snapshots are deliberately not selected at all.
          select: {
            id: true,
            action: true,
            entityType: true,
            entityLabel: true,
            createdAt: true,
            actor: { select: { username: true, fullName: true } },
          },
        })
      ).map(describeAuditEntry)
    : null

  return {
    generatedAt: new Date(),
    currentSession,
    totalSessions,
    users,
    academics: canSeeAcademics
      ? { classes, divisions, programs, subjects, academicGroups, sections, curriculumEntries }
      : null,
    structure,
    people: { students, staff, studentsEnrolledThisSession },
    recentActivity,
    quickActions: buildQuickActions(ctx.permissions),
    upcomingModules: UPCOMING_MODULES,
  }
}

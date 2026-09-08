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
import { collegeDateToStorage, todayInCollegeTimezone } from '../time/college-date'
import { getMyAttendance } from './attendance.service'
import {
  percentageOf,
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

/**
 * What is happening in the college right now. Every figure is a count or a
 * grouped count -- no row is fetched to be counted in JavaScript -- and each
 * block is null when the administrator lacks the permission to see it.
 */
export interface OperationsStatistics {
  attendance: {
    /** Sections in the current session. */
    sections: number
    /** Sections with a register (draft or submitted) for today. */
    sectionsWithRegisterToday: number
    submittedToday: number
    draftToday: number
    /** Attended share of this month's submitted entries, or null when none. */
    monthPercentage: number | null
    monthEntries: number
  } | null
  exams: {
    /** Exams in the current session that are scheduled or taking marks. */
    inProgress: number
    /** Mark sheets opened but not yet submitted. */
    markSheetsOpen: number
    /** Results generated but not yet published. */
    resultsAwaitingPublication: number
    resultsPublished: number
  } | null
  communication: {
    noticesShowing: number
    eventsNext30Days: number
    /** Students' applications still waiting on the office (Phase 23). */
    complaintsAwaitingOffice: number
  } | null
  timetable: {
    sections: number
    sectionsWithLessons: number
  } | null
  documents: {
    /** Students missing at least one required document. */
    studentsMissingRequired: number
  } | null
}

export interface AdminDashboardData {
  operations: OperationsStatistics
  /** Today, on the college's clock, for the headings. */
  today: string
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

  const operations = await operationsFor(ctx, currentSession?.id ?? null)

  return {
    operations,
    today: todayInCollegeTimezone(),
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

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** The first and last instants of this month on the college's calendar. */
function thisMonth(today: string): { from: Date; to: Date } {
  const [y, m] = today.split('-').map(Number) as [number, number]
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) }
}

async function operationsFor(ctx: AuthContext, sessionId: string | null): Promise<OperationsStatistics> {
  const has = (p: string) => ctx.permissions.has(p)
  const today = todayInCollegeTimezone()
  const todayStored = collegeDateToStorage(today)
  const month = thisMonth(today)
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 86_400_000)

  const [
    sections,
    registersToday,
    monthEntries,
    examsInProgress,
    markSheetsOpen,
    resultsByStatus,
    noticesShowing,
    eventsNext30Days,
    complaintsAwaitingOffice,
    sectionsWithLessons,
    requiredTypes,
    studentsActive,
    studentsWithAllRequired,
  ] = await Promise.all([
    sessionId ? prisma.section.count({ where: { academicSessionId: sessionId, isActive: true } }) : 0,
    has('attendance.view') && sessionId
      ? prisma.attendanceSheet.groupBy({
          by: ['sectionId', 'status'],
          where: { academicSessionId: sessionId, date: todayStored, status: { not: 'CANCELLED' } },
          _count: { _all: true },
        })
      : [],
    has('attendance.view') && sessionId
      ? prisma.attendanceEntry.groupBy({
          by: ['status'],
          where: {
            academicSessionId: sessionId,
            date: { gte: month.from, lt: month.to },
            sheet: { status: 'SUBMITTED' },
          },
          _count: { _all: true },
        })
      : [],
    has('exams.view') && sessionId
      ? prisma.exam.count({ where: { academicSessionId: sessionId, status: { in: ['SCHEDULED', 'MARKS_ENTRY'] } } })
      : 0,
    has('marks.view') && sessionId
      ? prisma.examMarkSheet.count({ where: { academicSessionId: sessionId, status: 'DRAFT' } })
      : 0,
    has('results.view') && sessionId
      ? prisma.result.groupBy({
          by: ['status'],
          where: { exam: { academicSessionId: sessionId } },
          _count: { _all: true },
        })
      : [],
    has('notices.view')
      ? prisma.notice.count({
          where: { status: 'PUBLISHED', publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        })
      : 0,
    has('events.view')
      ? prisma.event.count({ where: { status: 'PUBLISHED', startsAt: { gte: now, lte: in30Days } } })
      : 0,
    has('complaints.view')
      ? prisma.complaint.count({ where: { awaitingOffice: true, status: { in: ['SUBMITTED', 'IN_REVIEW'] } } })
      : 0,
    has('timetable.view') && sessionId
      ? prisma.section.count({
          where: { academicSessionId: sessionId, isActive: true, timetableSlots: { some: { isActive: true } } },
        })
      : 0,
    has('documents.view') ? prisma.documentType.count({ where: { ownerType: 'STUDENT', isRequired: true, isActive: true } }) : 0,
    has('documents.view') ? prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } }) : 0,
    // A student has every required document when the count of their CURRENT
    // documents of required types equals the number of required types. Done
    // as one grouped query, then compared in memory over one row per student.
    has('documents.view')
      ? prisma.document.groupBy({
          by: ['studentId'],
          where: {
            studentId: { not: null },
            status: { in: ['ACTIVE', 'NEEDS_REPLACEMENT'] },
            documentType: { ownerType: 'STUDENT', isRequired: true, isActive: true },
            student: { deletedAt: null, status: 'ACTIVE' },
          },
          _count: { _all: true },
        })
      : [],
  ])

  const attendance = has('attendance.view')
    ? (() => {
        const bySection = new Set(registersToday.map((r) => r.sectionId))
        const submittedToday = registersToday.filter((r) => r.status === 'SUBMITTED').reduce((n, r) => n + r._count._all, 0)
        const draftToday = registersToday.filter((r) => r.status === 'DRAFT').reduce((n, r) => n + r._count._all, 0)
        const total = monthEntries.reduce((n, r) => n + r._count._all, 0)
        const attended = monthEntries
          .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
          .reduce((n, r) => n + r._count._all, 0)
        return {
          sections,
          sectionsWithRegisterToday: bySection.size,
          submittedToday,
          draftToday,
          monthPercentage: percentageOf(attended, total),
          monthEntries: total,
        }
      })()
    : null

  const exams = has('exams.view')
    ? {
        inProgress: examsInProgress,
        markSheetsOpen,
        resultsAwaitingPublication: resultsByStatus.find((r) => r.status === 'DRAFT')?._count._all ?? 0,
        resultsPublished: resultsByStatus.find((r) => r.status === 'PUBLISHED')?._count._all ?? 0,
      }
    : null

  const communication =
    has('notices.view') || has('events.view') || has('complaints.view') ? { noticesShowing, eventsNext30Days, complaintsAwaitingOffice } : null

  const timetable = has('timetable.view') ? { sections, sectionsWithLessons } : null

  const documents = has('documents.view')
    ? {
        studentsMissingRequired:
          requiredTypes === 0
            ? 0
            : studentsActive - studentsWithAllRequired.filter((r) => r._count._all >= requiredTypes).length,
      }
    : null

  return { attendance, exams, communication, timetable, documents }
}

/* -------------------------------------------------------------------------- */
/* The student                                                                */
/* -------------------------------------------------------------------------- */

export interface StudentDashboardData {
  /** Overall attendance this session, or null when nothing has been taken. */
  attendancePercentage: number | null
  attendanceTotal: number
  publishedResults: number
  /** The next paper on a published date sheet for this student's class and programme. */
  nextPaper: { examName: string; subjectName: string; date: string; startTime: string | null } | null
}

/**
 * The student's own figures. Identity comes from the session (`ctx.studentId`)
 * and nowhere else, exactly as the attendance and results portals do.
 */
export async function getStudentDashboard(ctx: AuthContext): Promise<StudentDashboardData> {
  authorize(ctx, 'dashboard.view')
  if (ctx.role !== 'STUDENT' || !ctx.studentId) {
    throw new ForbiddenError('The student dashboard is only available to student accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const attendance = ctx.permissions.has('attendance.view') ? await getMyAttendance(ctx, { pageSize: 1 }) : null

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: ctx.studentId, status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
    select: { academicSessionId: true, section: { select: { academicGroup: { select: { classId: true, programId: true } } } } },
  })

  const [publishedResults, nextPaper] = await Promise.all([
    ctx.permissions.has('results.view')
      ? prisma.result.count({ where: { studentId: ctx.studentId, status: 'PUBLISHED' } })
      : 0,
    ctx.permissions.has('exams.view') && enrollment
      ? prisma.examPaper.findFirst({
          where: {
            academicSessionId: enrollment.academicSessionId,
            classId: enrollment.section.academicGroup.classId,
            OR: [{ programId: null }, { programId: enrollment.section.academicGroup.programId }],
            isActive: true,
            examDate: { gte: collegeDateToStorage(todayInCollegeTimezone()) },
            exam: { status: { in: ['SCHEDULED', 'MARKS_ENTRY'] } },
          },
          orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
          select: { examDate: true, startTime: true, subject: { select: { name: true } }, exam: { select: { name: true } } },
        })
      : null,
  ])

  return {
    attendancePercentage: attendance?.overall.percentage ?? null,
    attendanceTotal: attendance?.overall.total ?? 0,
    publishedResults,
    nextPaper: nextPaper
      ? {
          examName: nextPaper.exam.name,
          subjectName: nextPaper.subject.name,
          date: nextPaper.examDate!.toISOString().slice(0, 10),
          startTime: nextPaper.startTime,
        }
      : null,
  }
}

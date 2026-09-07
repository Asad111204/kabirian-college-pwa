/**
 * The report centre: the same figures the screens show, gathered for a whole
 * scope at once, grouped by a level of the academic structure, and rendered
 * either as JSON for the page or as CSV for a file.
 *
 * Two rules shape this file.
 *
 *   - **A report is office work.** Every function requires the ADMIN role and
 *     `reports.generate` (ADR-058). Teachers have their own scoped attendance
 *     report already; the report centre is the college-wide view.
 *   - **One query, two renderings.** The CSV route calls the same function as
 *     the page, with the same filters, and writes the same rows. Nothing is
 *     recomputed for the export, so it cannot drift from what was on screen.
 *
 * Nothing here is a new source of truth. Where a module already has the query
 * -- attendance, exam mark sheets, results -- it is called, not copied.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { NotFoundError } from '../api/errors'
import { assertAdminArea } from './service-utils'
import { getAttendanceOverview, getStudentAttendanceReport, type AttendanceOverview, type StudentReportRow } from './attendance-report.service'
import { listExamMarkSheets, type MarkSheetStatusRow } from './marks.service'
import { getResultSummary, listResults, type ResultRow, type ResultSummary } from './results.service'
import { storageToCollegeDate } from '../time/college-date'
import type {
  AttendanceReportExportQuery,
  ExamReportQuery,
  MissingDocumentsQuery,
  ResultReportQuery,
  StaffReportQuery,
  StudentReportQuery,
} from '@/validation/reports'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** One block of a grouped report: a heading, its rows, and how many. */
export interface ReportGroup<Row> {
  key: string
  label: string
  rows: Row[]
  count: number
}

export interface ReportScopeLabel {
  sessionName: string | null
  className: string | null
  divisionName: string | null
  programName: string | null
  groupLabel: string | null
  sectionName: string | null
}

export interface StudentReportRowOut {
  studentCode: string
  admissionNumber: string
  fullName: string
  fatherName: string
  status: string
  admissionDate: string
  className: string | null
  divisionName: string | null
  programName: string | null
  sectionName: string | null
  rollNumber: string | null
  hasAccount: boolean
}

export interface StaffReportRow {
  staffCode: string
  fullName: string
  designation: string
  department: string | null
  staffType: string
  employmentStatus: string
  phone: string | null
  joiningDate: string
  activeAssignments: number
  hasAccount: boolean
}

export interface MissingDocumentRow {
  studentCode: string
  fullName: string
  className: string | null
  divisionName: string | null
  programName: string | null
  sectionName: string | null
  /** The required types this student has no current document for. */
  missing: string[]
}

export interface ExamReportOut {
  exam: { id: string; name: string; examTypeName: string; sessionName: string; status: string }
  papers: MarkSheetStatusRow[]
  totals: { papers: number; submitted: number; open: number; notOpened: number }
}

export interface ResultReportOut {
  exam: { id: string; name: string; examTypeName: string; sessionName: string }
  summary: ResultSummary
  groups: ReportGroup<ResultRow>[]
  total: number
}

export interface GroupedReport<Row> {
  generatedAt: string
  scope: ReportScopeLabel
  groups: ReportGroup<Row>[]
  total: number
}

/* -------------------------------------------------------------------------- */
/* Guards and helpers                                                         */
/* -------------------------------------------------------------------------- */

function requireReports(ctx: AuthContext): void {
  assertAdminArea(ctx, 'Reports')
  authorize(ctx, 'reports.generate')
}

const iso = (d: Date | null | undefined): string | null => (d ? storageToCollegeDate(d) : null)

/** The session a report is about: the one asked for, else the current one. */
async function resolveSession(id: string | undefined): Promise<{ id: string; name: string } | null> {
  if (id) return prisma.academicSession.findUnique({ where: { id }, select: { id: true, name: true } })
  return prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } })
}

/** Names for the filters in force, for the heading and the file name. */
async function scopeLabel(
  q: { classId?: string; divisionId?: string; programId?: string; academicGroupId?: string; sectionId?: string },
  session: { name: string } | null,
): Promise<ReportScopeLabel> {
  const [cls, div, prog, grp, sec] = await Promise.all([
    q.classId ? prisma.class.findUnique({ where: { id: q.classId }, select: { name: true } }) : null,
    q.divisionId ? prisma.division.findUnique({ where: { id: q.divisionId }, select: { name: true } }) : null,
    q.programId ? prisma.program.findUnique({ where: { id: q.programId }, select: { name: true } }) : null,
    q.academicGroupId
      ? prisma.academicGroup.findUnique({
          where: { id: q.academicGroupId },
          select: { class: { select: { name: true } }, division: { select: { name: true } }, program: { select: { name: true } } },
        })
      : null,
    q.sectionId ? prisma.section.findUnique({ where: { id: q.sectionId }, select: { name: true } }) : null,
  ])
  return {
    sessionName: session?.name ?? null,
    className: cls?.name ?? null,
    divisionName: div?.name ?? null,
    programName: prog?.name ?? null,
    groupLabel: grp ? `${grp.class.name} · ${grp.division.name} · ${grp.program.name}` : null,
    sectionName: sec?.name ?? null,
  }
}

/** Splits rows into groups by a key, keeping the rows' order inside each. */
function groupRows<Row>(rows: Row[], keyOf: (row: Row) => { key: string; label: string } | null): ReportGroup<Row>[] {
  const groups = new Map<string, ReportGroup<Row>>()
  for (const row of rows) {
    const k = keyOf(row) ?? { key: '', label: 'All' }
    const g = groups.get(k.key) ?? { key: k.key, label: k.label, rows: [], count: 0 }
    g.rows.push(row)
    g.count += 1
    groups.set(k.key, g)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** The enrollment filter for a scope: section, or group, or its parts. */
function enrollmentWhere(sessionId: string, q: StudentReportQuery | MissingDocumentsQuery): Prisma.StudentEnrollmentWhereInput {
  return {
    academicSessionId: sessionId,
    status: 'ACTIVE',
    ...(q.sectionId ? { sectionId: q.sectionId } : {}),
    ...(q.academicGroupId || q.classId || q.divisionId || q.programId
      ? {
          section: {
            academicGroup: {
              ...(q.academicGroupId ? { id: q.academicGroupId } : {}),
              ...(q.classId ? { classId: q.classId } : {}),
              ...(q.divisionId ? { divisionId: q.divisionId } : {}),
              ...(q.programId ? { programId: q.programId } : {}),
            },
          },
        }
      : {}),
  }
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

const PLACEMENT_SELECT = {
  rollNumber: true,
  section: {
    select: {
      name: true,
      academicGroup: {
        select: {
          id: true,
          class: { select: { name: true } },
          division: { select: { name: true } },
          program: { select: { name: true } },
        },
      },
    },
  },
} as const

type Placement = Prisma.StudentEnrollmentGetPayload<{ select: typeof PLACEMENT_SELECT }>

const groupKeyFor = (groupBy: string, p: Placement | null): { key: string; label: string } | null => {
  if (!p || groupBy === 'none') return null
  const g = p.section.academicGroup
  switch (groupBy) {
    case 'class':
      return { key: g.class.name, label: g.class.name }
    case 'division':
      return { key: g.division.name, label: g.division.name }
    case 'program':
      return { key: g.program.name, label: g.program.name }
    case 'group':
      return { key: g.id, label: `${g.class.name} · ${g.division.name} · ${g.program.name}` }
    case 'section':
      return { key: `${g.id}/${p.section.name}`, label: `${g.class.name} · ${g.division.name} · ${g.program.name} · Section ${p.section.name}` }
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

export async function getStudentReport(ctx: AuthContext, q: StudentReportQuery): Promise<GroupedReport<StudentReportRowOut>> {
  requireReports(ctx)
  const session = await resolveSession(q.academicSessionId)
  const scoped = Boolean(q.sectionId || q.academicGroupId || q.classId || q.divisionId || q.programId)

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      ...(q.status !== 'ALL' ? { status: q.status } : {}),
      ...(session && scoped ? { enrollments: { some: enrollmentWhere(session.id, q) } } : {}),
    },
    orderBy: [{ fullName: 'asc' }, { studentCode: 'asc' }],
    select: {
      studentCode: true,
      admissionNumber: true,
      fullName: true,
      fatherName: true,
      status: true,
      admissionDate: true,
      userId: true,
      // With no session there is no placement to show; the nil id matches nothing,
      // which keeps the select's shape (and its type) the same either way.
      enrollments: { where: { academicSessionId: session?.id ?? NIL_UUID, status: 'ACTIVE' }, take: 1, select: PLACEMENT_SELECT },
    },
  })

  const rows = students.map((s) => {
    const p = s.enrollments[0] ?? null
    return {
      placement: p,
      row: {
        studentCode: s.studentCode,
        admissionNumber: s.admissionNumber,
        fullName: s.fullName,
        fatherName: s.fatherName,
        status: s.status,
        admissionDate: iso(s.admissionDate) ?? '',
        className: p?.section.academicGroup.class.name ?? null,
        divisionName: p?.section.academicGroup.division.name ?? null,
        programName: p?.section.academicGroup.program.name ?? null,
        sectionName: p?.section.name ?? null,
        rollNumber: p?.rollNumber ?? null,
        hasAccount: s.userId !== null,
      } satisfies StudentReportRowOut,
    }
  })

  const groups = groupRows(rows, (r) => groupKeyFor(q.groupBy, r.placement)).map((g) => ({
    ...g,
    rows: g.rows.map((r) => r.row),
  }))

  return { generatedAt: new Date().toISOString(), scope: await scopeLabel(q, session), groups, total: rows.length }
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export async function getStaffReport(ctx: AuthContext, q: StaffReportQuery): Promise<GroupedReport<StaffReportRow>> {
  requireReports(ctx)
  const staff = await prisma.staff.findMany({
    where: {
      deletedAt: null,
      ...(q.status !== 'ALL' ? { employmentStatus: q.status } : {}),
      ...(q.staffType !== 'ALL' ? { staffType: q.staffType } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.designationId ? { designationId: q.designationId } : {}),
    },
    orderBy: [{ fullName: 'asc' }, { staffCode: 'asc' }],
    select: {
      staffCode: true,
      fullName: true,
      staffType: true,
      employmentStatus: true,
      phone: true,
      joiningDate: true,
      userId: true,
      designation: { select: { name: true } },
      department: { select: { name: true } },
      _count: { select: { teacherAssignments: { where: { isActive: true } } } },
    },
  })

  const rows: StaffReportRow[] = staff.map((s) => ({
    staffCode: s.staffCode,
    fullName: s.fullName,
    designation: s.designation.name,
    department: s.department?.name ?? null,
    staffType: s.staffType,
    employmentStatus: s.employmentStatus,
    phone: s.phone,
    joiningDate: iso(s.joiningDate) ?? '',
    activeAssignments: s._count.teacherAssignments,
    hasAccount: s.userId !== null,
  }))

  const groups = groupRows(rows, (r) => {
    switch (q.groupBy) {
      case 'department':
        return { key: r.department ?? '—', label: r.department ?? 'No department' }
      case 'designation':
        return { key: r.designation, label: r.designation }
      case 'type':
        return { key: r.staffType, label: r.staffType }
      default:
        return null
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    scope: { sessionName: null, className: null, divisionName: null, programName: null, groupLabel: null, sectionName: null },
    groups,
    total: rows.length,
  }
}

/* -------------------------------------------------------------------------- */
/* Missing documents                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Students with no current document of a required type.
 *
 * One query for the required types, one for the students in scope with the
 * current documents they do hold; the gap is worked out per student in
 * memory over one row each. "Current" means ACTIVE or NEEDS_REPLACEMENT --
 * the same rule as the profile checklist -- so a flagged document still
 * counts as held, and the checklist and the report never disagree.
 */
export async function getMissingDocumentsReport(
  ctx: AuthContext,
  q: MissingDocumentsQuery,
): Promise<GroupedReport<MissingDocumentRow> & { types: { key: string; label: string }[] }> {
  requireReports(ctx)
  authorize(ctx, 'documents.view')
  const session = await resolveSession(q.academicSessionId)
  const scoped = Boolean(q.sectionId || q.academicGroupId || q.classId || q.divisionId || q.programId)

  const required = await prisma.documentType.findMany({
    where: { ownerType: 'STUDENT', isRequired: true, isActive: true, ...(q.documentTypeKey ? { key: q.documentTypeKey } : {}) },
    orderBy: { sortOrder: 'asc' },
    select: { key: true, label: true },
  })
  if (required.length === 0) {
    return { generatedAt: new Date().toISOString(), scope: await scopeLabel(q, session), groups: [], total: 0, types: [] }
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(session && scoped ? { enrollments: { some: enrollmentWhere(session.id, q) } } : {}),
    },
    orderBy: [{ fullName: 'asc' }],
    select: {
      studentCode: true,
      fullName: true,
      documents: {
        where: { status: { in: ['ACTIVE', 'NEEDS_REPLACEMENT'] }, documentTypeKey: { in: required.map((t) => t.key) } },
        select: { documentTypeKey: true },
      },
      // With no session there is no placement to show; the nil id matches nothing,
      // which keeps the select's shape (and its type) the same either way.
      enrollments: { where: { academicSessionId: session?.id ?? NIL_UUID, status: 'ACTIVE' }, take: 1, select: PLACEMENT_SELECT },
    },
  })

  const rows = students
    .map((s) => {
      const held = new Set(s.documents.map((d) => d.documentTypeKey))
      const missing = required.filter((t) => !held.has(t.key)).map((t) => t.label)
      const p = s.enrollments[0] ?? null
      return {
        placement: p,
        row: {
          studentCode: s.studentCode,
          fullName: s.fullName,
          className: p?.section.academicGroup.class.name ?? null,
          divisionName: p?.section.academicGroup.division.name ?? null,
          programName: p?.section.academicGroup.program.name ?? null,
          sectionName: p?.section.name ?? null,
          missing,
        } satisfies MissingDocumentRow,
      }
    })
    .filter((r) => r.row.missing.length > 0)

  const groups = groupRows(rows, (r) => groupKeyFor(q.groupBy, r.placement)).map((g) => ({ ...g, rows: g.rows.map((r) => r.row) }))

  return { generatedAt: new Date().toISOString(), scope: await scopeLabel(q, session), groups, total: rows.length, types: required }
}

/* -------------------------------------------------------------------------- */
/* Exams and results                                                          */
/* -------------------------------------------------------------------------- */

async function examHeader(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true, status: true, examType: { select: { name: true } }, academicSession: { select: { name: true } } },
  })
  return exam
    ? { id: exam.id, name: exam.name, status: exam.status, examTypeName: exam.examType.name, sessionName: exam.academicSession.name }
    : null
}

/** Which papers of an exam have been marked, by section, with the counts. */
export async function getExamReport(ctx: AuthContext, q: ExamReportQuery): Promise<ExamReportOut> {
  requireReports(ctx)
  const [exam, papers] = await Promise.all([examHeader(q.examId), listExamMarkSheets(ctx, q.examId)])
  if (!exam) throw new NotFoundError('exam')
  return {
    exam,
    papers,
    totals: {
      papers: papers.length,
      submitted: papers.filter((p) => p.status === 'SUBMITTED' || p.status === 'PUBLISHED').length,
      open: papers.filter((p) => p.status === 'DRAFT').length,
      notOpened: papers.filter((p) => p.status === null).length,
    },
  }
}

/**
 * Every result of an exam in scope, grouped -- "FAIT result summary" is this
 * with the programme filter set. Reuses the review list page by page so the
 * ordering (position, then name) and every figure are exactly the review's.
 */
export async function getResultReport(ctx: AuthContext, q: ResultReportQuery): Promise<ResultReportOut> {
  requireReports(ctx)
  const [exam, summary] = await Promise.all([examHeader(q.examId), getResultSummary(ctx, q.examId)])
  if (!exam) throw new NotFoundError('exam')

  const rows: ResultRow[] = []
  for (let page = 1; ; page += 1) {
    const chunk = await listResults(ctx, q.examId, {
      page,
      pageSize: 100,
      classId: q.classId,
      programId: q.programId,
      sectionId: q.sectionId,
      outcome: q.outcome,
      status: q.status,
    })
    rows.push(...chunk.items)
    if (page >= chunk.totalPages) break
  }

  const groups = groupRows(rows, (r) => {
    switch (q.groupBy) {
      case 'class':
        return { key: r.className, label: r.className }
      case 'program':
        return { key: r.programName, label: r.programName }
      case 'section':
        return { key: `${r.className}/${r.divisionName}/${r.programName}/${r.sectionName}`, label: `${r.className} · ${r.divisionName} · ${r.programName} · Section ${r.sectionName}` }
      default:
        return null
    }
  })

  return { exam: { id: exam.id, name: exam.name, examTypeName: exam.examTypeName, sessionName: exam.sessionName }, summary, groups, total: rows.length }
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export interface AttendanceReportOut {
  overview: AttendanceOverview
  students: StudentReportRow[]
}

/** The attendance overview plus every student in scope, for one file. */
export async function getAttendanceReportExport(ctx: AuthContext, q: AttendanceReportExportQuery): Promise<AttendanceReportOut> {
  requireReports(ctx)
  const filters = {
    academicSessionId: q.academicSessionId,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    classId: q.classId,
    divisionId: q.divisionId,
    programId: q.programId,
    sectionId: q.sectionId,
    subjectId: q.subjectId,
    kind: q.kind,
  }
  const overview = await getAttendanceOverview(ctx, filters)
  const students: StudentReportRow[] = []
  for (let page = 1; ; page += 1) {
    const chunk = await getStudentAttendanceReport(ctx, filters, { page, pageSize: 100, sort: 'name' })
    students.push(...chunk.items)
    if (page >= chunk.totalPages) break
  }
  return { overview, students }
}

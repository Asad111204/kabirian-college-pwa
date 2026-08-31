/**
 * Attendance reports.
 *
 * Everything here is counted by PostgreSQL. Nothing loads a college's
 * attendance into JavaScript to add it up — that would work for a term and fail
 * for a year.
 *
 * The shape of the main query is worth understanding. One grouped statement
 * returns counts at the **(section × subject)** grain, joined to the class,
 * division and program names. That result set is bounded by the timetable —
 * twenty sections times a handful of subjects — not by the number of students or
 * entries. Every breakdown the page shows (by class, by division, by program, by
 * section, by subject) is then a trivial roll-up of those few rows.
 *
 * So a report over a million attendance entries costs one aggregate query, and
 * the rows that come back fit on a screen.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ForbiddenError, ValidationError } from '../api/errors'
import { readSetting } from '../settings/settings-store'
import { paginatedResult, type PaginatedResult } from './service-utils'
import { isValidCollegeDate } from '../time/college-date'
import { summarise, type AttendanceSummary } from '../attendance/attendance-policy'
import { Prisma } from '@/generated/prisma/client'

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportFilters {
  academicSessionId?: string
  dateFrom?: string
  dateTo?: string
  classId?: string
  divisionId?: string
  programId?: string
  sectionId?: string
  subjectId?: string
  /** Daily roll-call only, subject lessons only, or both. */
  kind?: 'all' | 'daily' | 'subject'
}

/** Sorting a student report. A whitelist — never a column name from the query. */
export type StudentReportSort = 'percentage_asc' | 'percentage_desc' | 'name' | 'code'

function assertValidRange(filters: ReportFilters): void {
  for (const [label, value] of [
    ['start date', filters.dateFrom],
    ['end date', filters.dateTo],
  ] as const) {
    if (value && !isValidCollegeDate(value)) {
      throw new ValidationError(`That ${label} is not a real calendar date.`)
    }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new ValidationError('The start date must be on or before the end date.')
  }
}

/**
 * The WHERE clauses shared by every report.
 *
 * Each value is passed as a parameter — nothing from the request is ever
 * concatenated into SQL.
 */
function baseConditions(filters: ReportFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    // The rule that makes a report an official figure rather than a guess.
    Prisma.sql`sh.status = 'SUBMITTED'`,
  ]

  if (filters.academicSessionId) {
    conditions.push(Prisma.sql`sh.academic_session_id = ${filters.academicSessionId}::uuid`)
  }
  if (filters.dateFrom) conditions.push(Prisma.sql`sh.date >= ${filters.dateFrom}::date`)
  if (filters.dateTo) conditions.push(Prisma.sql`sh.date <= ${filters.dateTo}::date`)
  if (filters.classId) conditions.push(Prisma.sql`g.class_id = ${filters.classId}::uuid`)
  if (filters.divisionId) conditions.push(Prisma.sql`g.division_id = ${filters.divisionId}::uuid`)
  if (filters.programId) conditions.push(Prisma.sql`g.program_id = ${filters.programId}::uuid`)
  if (filters.sectionId) conditions.push(Prisma.sql`sh.section_id = ${filters.sectionId}::uuid`)
  if (filters.subjectId) conditions.push(Prisma.sql`sh.subject_id = ${filters.subjectId}::uuid`)
  if (filters.kind === 'daily') conditions.push(Prisma.sql`sh.subject_id IS NULL`)
  if (filters.kind === 'subject') conditions.push(Prisma.sql`sh.subject_id IS NOT NULL`)

  return conditions
}

/**
 * What this person is allowed to report on.
 *
 * An administrator: everything. A teacher: registers for the subjects they are
 * assigned, plus daily roll-call for sections they are in charge of — expressed
 * as `EXISTS` clauses so the answer is read from the database on every query
 * rather than from a list the caller could influence.
 *
 * A teacher who narrows by `sectionId` or `subjectId` can only ever shrink this,
 * because the scope clause is ANDed with their filters.
 */
function scopeCondition(ctx: AuthContext): Prisma.Sql {
  if (ctx.role === 'ADMIN') return Prisma.sql`TRUE`

  if (ctx.role === 'STAFF' && ctx.staffId) {
    const staffId = ctx.staffId
    return Prisma.sql`(
      EXISTS (
        SELECT 1 FROM teacher_assignments ta
         WHERE ta.staff_id = ${staffId}::uuid
           AND ta.is_active
           AND ta.section_id = sh.section_id
           AND ta.subject_id = sh.subject_id
      )
      OR (
        sh.subject_id IS NULL
        AND EXISTS (
          SELECT 1 FROM section_incharges si
           WHERE si.staff_id = ${staffId}::uuid
             AND si.is_active
             AND si.section_id = sh.section_id
        )
      )
    )`
  }

  // Students and unlinked logins report on nothing.
  return Prisma.sql`FALSE`
}

function whereClause(ctx: AuthContext, filters: ReportFilters): Prisma.Sql {
  const conditions = [...baseConditions(filters), scopeCondition(ctx)]
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
}

/** The counting expressions, written once. */
const COUNTS = Prisma.sql`
  COUNT(*) FILTER (WHERE e.status = 'PRESENT') AS present,
  COUNT(*) FILTER (WHERE e.status = 'ABSENT')  AS absent,
  COUNT(*) FILTER (WHERE e.status = 'LATE')    AS late,
  COUNT(*) FILTER (WHERE e.status = 'LEAVE')   AS leave_count
`

/** The joins every report needs to reach class, division and program. */
const FROM_ATTENDANCE = Prisma.sql`
  FROM attendance_entries e
  JOIN attendance_sheets  sh  ON sh.id  = e.sheet_id
  JOIN sections           sec ON sec.id = sh.section_id
  JOIN academic_groups    g   ON g.id   = sec.academic_group_id
  JOIN classes            cl  ON cl.id  = g.class_id
  JOIN divisions          d   ON d.id   = g.division_id
  JOIN programs           p   ON p.id   = g.program_id
  LEFT JOIN subjects      sub ON sub.id = sh.subject_id
`

interface CountRow {
  present: bigint
  absent: bigint
  late: bigint
  leave_count: bigint
}

function toCounts(row: CountRow) {
  return {
    present: Number(row.present),
    absent: Number(row.absent),
    late: Number(row.late),
    leave: Number(row.leave_count),
  }
}

async function leaveCountsAsPresent(): Promise<boolean> {
  return (await readSetting<boolean>('attendance.leave_counts_as_present')) === true
}

/**
 * Reports are for the office and for teachers. A student's own attendance lives
 * at `/student/attendance`, which answers a different question with a different
 * shape — so a student asking for a report is refused outright rather than being
 * handed an empty one, which would only look like a bug.
 */
function assertCanReport(ctx: AuthContext): void {
  authorize(ctx, 'attendance.view')
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') {
    throw new ForbiddenError('Attendance reports are available to staff and administrators.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
}

/* -------------------------------------------------------------------------- */
/* The overview                                                               */
/* -------------------------------------------------------------------------- */

export interface BreakdownRow extends AttendanceSummary {
  id: string
  label: string
  /** Extra context for the section and subject tables. */
  detail?: string
  sheets: number
}

export interface AttendanceOverview {
  overall: AttendanceSummary & { sheets: number; students: number }
  byClass: BreakdownRow[]
  byDivision: BreakdownRow[]
  byProgram: BreakdownRow[]
  bySection: BreakdownRow[]
  bySubject: BreakdownRow[]
  /** True when the report's figures include daily roll-call registers. */
  includesDaily: boolean
}

interface GrainRow extends CountRow {
  class_id: string
  class_name: string
  division_id: string
  division_name: string
  program_id: string
  program_name: string
  section_id: string
  section_name: string
  subject_id: string | null
  subject_name: string | null
  sheets: bigint
}

/**
 * Every breakdown the report shows, from **one** grouped query.
 *
 * The grain is (section × subject), so the result set is the size of the
 * timetable rather than the size of the attendance table. Rolling that up by
 * class, division, program and subject is then arithmetic over a few dozen rows.
 */
export async function getAttendanceOverview(
  ctx: AuthContext,
  filters: ReportFilters = {},
): Promise<AttendanceOverview> {
  assertCanReport(ctx)
  assertValidRange(filters)

  const where = whereClause(ctx, filters)

  const [rows, studentRow] = await Promise.all([
    prisma.$queryRaw<GrainRow[]>`
      SELECT g.class_id, cl.name AS class_name,
             g.division_id, d.name AS division_name,
             g.program_id, p.name AS program_name,
             sec.id AS section_id, sec.name AS section_name,
             sh.subject_id, sub.name AS subject_name,
             COUNT(DISTINCT sh.id) AS sheets,
             ${COUNTS}
      ${FROM_ATTENDANCE}
      ${where}
      GROUP BY g.class_id, cl.name, g.division_id, d.name, g.program_id, p.name,
               sec.id, sec.name, sh.subject_id, sub.name
    `,
    prisma.$queryRaw<Array<{ students: bigint; sheets: bigint }>>`
      SELECT COUNT(DISTINCT e.student_id) AS students, COUNT(DISTINCT sh.id) AS sheets
      ${FROM_ATTENDANCE}
      ${where}
    `,
  ])

  const leaveAsPresent = await leaveCountsAsPresent()

  /** Sums the grain rows into one breakdown, keyed however the caller wants. */
  function rollUp(
    keyOf: (row: GrainRow) => { id: string; label: string; detail?: string } | null,
  ): BreakdownRow[] {
    const buckets = new Map<
      string,
      { label: string; detail?: string; present: number; absent: number; late: number; leave: number; sheets: number }
    >()

    for (const row of rows) {
      const key = keyOf(row)
      if (!key) continue
      const bucket = buckets.get(key.id) ?? {
        label: key.label,
        detail: key.detail,
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        sheets: 0,
      }
      const counts = toCounts(row)
      bucket.present += counts.present
      bucket.absent += counts.absent
      bucket.late += counts.late
      bucket.leave += counts.leave
      bucket.sheets += Number(row.sheets)
      buckets.set(key.id, bucket)
    }

    return [...buckets.entries()]
      .map(([id, bucket]) => ({
        id,
        label: bucket.label,
        detail: bucket.detail,
        sheets: bucket.sheets,
        ...summarise(
          { present: bucket.present, absent: bucket.absent, late: bucket.late, leave: bucket.leave },
          { leaveCountsAsPresent: leaveAsPresent },
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const totals = rows.reduce(
    (acc, row) => {
      const counts = toCounts(row)
      return {
        present: acc.present + counts.present,
        absent: acc.absent + counts.absent,
        late: acc.late + counts.late,
        leave: acc.leave + counts.leave,
      }
    },
    { present: 0, absent: 0, late: 0, leave: 0 },
  )

  return {
    overall: {
      ...summarise(totals, { leaveCountsAsPresent: leaveAsPresent }),
      sheets: Number(studentRow[0]?.sheets ?? 0),
      students: Number(studentRow[0]?.students ?? 0),
    },
    byClass: rollUp((row) => ({ id: row.class_id, label: row.class_name })),
    byDivision: rollUp((row) => ({ id: row.division_id, label: row.division_name })),
    byProgram: rollUp((row) => ({ id: row.program_id, label: row.program_name })),
    bySection: rollUp((row) => ({
      id: row.section_id,
      label: `Section ${row.section_name}`,
      detail: `${row.class_name} · ${row.division_name} · ${row.program_name}`,
    })),
    // Daily roll-call is a row of its own here, never a subject.
    bySubject: rollUp((row) => ({
      id: row.subject_id ?? 'DAILY',
      label: row.subject_name ?? 'Daily roll call',
    })),
    includesDaily: rows.some((row) => row.subject_id === null),
  }
}

/* -------------------------------------------------------------------------- */
/* Student-level report                                                       */
/* -------------------------------------------------------------------------- */

export interface StudentReportRow extends AttendanceSummary {
  studentId: string
  studentCode: string
  fullName: string
}

interface StudentRow extends CountRow {
  student_id: string
  student_code: string
  full_name: string
}

/**
 * Attendance per student, counted in the database and paginated.
 *
 * Sorting by percentage is done in SQL so the *lowest attendance in the whole
 * section* reaches page one — sorting a single page in JavaScript would only
 * order the twenty-five rows that happened to come back.
 *
 * Students with nothing counted sort to the very bottom (`NULLS LAST`) rather
 * than appearing as 0%, which would read as "never attends".
 */
export async function getStudentAttendanceReport(
  ctx: AuthContext,
  filters: ReportFilters = {},
  options: { page?: number; pageSize?: number; sort?: StudentReportSort } = {},
): Promise<PaginatedResult<StudentReportRow>> {
  assertCanReport(ctx)
  assertValidRange(filters)

  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 25
  const sort = options.sort ?? 'percentage_asc'
  const where = whereClause(ctx, filters)
  const leaveAsPresent = await leaveCountsAsPresent()

  /**
   * The percentage, expressed in SQL so it can be sorted on. It has to match
   * `summarise()` exactly, and the LEAVE half is driven by the same college
   * setting — passed as a parameter rather than branching the query.
   */
  const percentageExpr = Prisma.sql`
    CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE (
           COUNT(*) FILTER (WHERE e.status IN ('PRESENT','LATE'))
           + CASE WHEN ${leaveAsPresent} THEN COUNT(*) FILTER (WHERE e.status = 'LEAVE') ELSE 0 END
         ) * 100.0 / COUNT(*)
    END
  `

  // A whitelist. No column name ever comes from the request.
  const orderBy =
    sort === 'percentage_desc'
      ? Prisma.sql`ORDER BY ${percentageExpr} DESC NULLS LAST, st.full_name ASC`
      : sort === 'name'
        ? Prisma.sql`ORDER BY st.full_name ASC`
        : sort === 'code'
          ? Prisma.sql`ORDER BY st.student_code ASC`
          : Prisma.sql`ORDER BY ${percentageExpr} ASC NULLS LAST, st.full_name ASC`

  const [rows, totalRow] = await Promise.all([
    prisma.$queryRaw<StudentRow[]>`
      SELECT e.student_id, st.student_code, st.full_name, ${COUNTS}
      ${FROM_ATTENDANCE}
      JOIN students st ON st.id = e.student_id
      ${where}
      GROUP BY e.student_id, st.student_code, st.full_name
      ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(DISTINCT e.student_id) AS total
      ${FROM_ATTENDANCE}
      ${where}
    `,
  ])

  return paginatedResult(
    rows.map((row) => ({
      studentId: row.student_id,
      studentCode: row.student_code,
      fullName: row.full_name,
      ...summarise(toCounts(row), { leaveCountsAsPresent: leaveAsPresent }),
    })),
    Number(totalRow[0]?.total ?? 0),
    page,
    pageSize,
  )
}

/* -------------------------------------------------------------------------- */
/* Registers marked                                                           */
/* -------------------------------------------------------------------------- */

export interface RegisterReportRow {
  id: string
  date: string
  period: number
  className: string
  divisionName: string
  programName: string
  sectionName: string
  subjectName: string | null
  markedByName: string
  students: number
  present: number
  absent: number
  late: number
  leave: number
}

/**
 * Which registers were taken, and by whom.
 *
 * For an administrator this is teacher activity; for a teacher it is their own
 * history, because the same scope clause narrows it. Counts come from the same
 * aggregate, so no register is queried twice.
 *
 * It reports on the attendance tables only — the audit log is not read, and no
 * audit payload is exposed.
 */
export async function getRegisterReport(
  ctx: AuthContext,
  filters: ReportFilters & { staffId?: string } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<RegisterReportRow>> {
  assertCanReport(ctx)
  assertValidRange(filters)

  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 25

  const conditions = [...baseConditions(filters), scopeCondition(ctx)]
  if (filters.staffId) {
    conditions.push(Prisma.sql`sh.marked_by_staff_id = ${filters.staffId}::uuid`)
  }
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`

  const [rows, totalRow] = await Promise.all([
    prisma.$queryRaw<
      Array<
        CountRow & {
          id: string
          date: Date
          period: number
          class_name: string
          division_name: string
          program_name: string
          section_name: string
          subject_name: string | null
          marked_by: string
          students: bigint
        }
      >
    >`
      SELECT sh.id, sh.date, sh.period,
             cl.name AS class_name, d.name AS division_name, p.name AS program_name,
             sec.name AS section_name, sub.name AS subject_name,
             stf.full_name AS marked_by,
             COUNT(*) AS students,
             ${COUNTS}
      ${FROM_ATTENDANCE}
      JOIN staff stf ON stf.id = sh.marked_by_staff_id
      ${where}
      GROUP BY sh.id, sh.date, sh.period, cl.name, d.name, p.name, sec.name, sub.name, stf.full_name
      ORDER BY sh.date DESC, sh.period ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(DISTINCT sh.id) AS total
      ${FROM_ATTENDANCE}
      ${where}
    `,
  ])

  return paginatedResult(
    rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      period: row.period,
      className: row.class_name,
      divisionName: row.division_name,
      programName: row.program_name,
      sectionName: row.section_name,
      subjectName: row.subject_name,
      markedByName: row.marked_by,
      students: Number(row.students),
      ...toCounts(row),
    })),
    Number(totalRow[0]?.total ?? 0),
    page,
    pageSize,
  )
}

/* -------------------------------------------------------------------------- */
/* What a teacher may report on                                               */
/* -------------------------------------------------------------------------- */

export interface TeacherReportScope {
  kind: 'subject' | 'daily'
  sectionId: string
  subjectId: string | null
  subjectName: string | null
  className: string
  divisionName: string
  programName: string
  sectionName: string
}

/**
 * The scopes a teacher may report on — their assigned subjects, and the sections
 * they run. Read from their own records, so the page offers nothing they could
 * not already query.
 */
export async function getTeacherReportScopes(ctx: AuthContext): Promise<TeacherReportScope[]> {
  authorize(ctx, 'attendance.view')

  if (ctx.role !== 'STAFF' || !ctx.staffId) {
    throw new ForbiddenError('The staff portal is only available to staff accounts.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }

  const staffId = ctx.staffId

  const rows = await prisma.$queryRaw<
    Array<{
      kind: string
      section_id: string
      subject_id: string | null
      subject_name: string | null
      class_name: string
      division_name: string
      program_name: string
      section_name: string
    }>
  >`
    SELECT 'subject' AS kind, ta.section_id, ta.subject_id, sub.name AS subject_name,
           cl.name AS class_name, d.name AS division_name, p.name AS program_name,
           sec.name AS section_name
      FROM teacher_assignments ta
      JOIN sections        sec ON sec.id = ta.section_id
      JOIN academic_groups g   ON g.id   = sec.academic_group_id
      JOIN classes         cl  ON cl.id  = g.class_id
      JOIN divisions       d   ON d.id   = g.division_id
      JOIN programs        p   ON p.id   = g.program_id
      JOIN subjects        sub ON sub.id = ta.subject_id
     WHERE ta.staff_id = ${staffId}::uuid AND ta.is_active

    UNION ALL

    SELECT 'daily' AS kind, si.section_id, NULL, NULL,
           cl.name, d.name, p.name, sec.name
      FROM section_incharges si
      JOIN sections        sec ON sec.id = si.section_id
      JOIN academic_groups g   ON g.id   = sec.academic_group_id
      JOIN classes         cl  ON cl.id  = g.class_id
      JOIN divisions       d   ON d.id   = g.division_id
      JOIN programs        p   ON p.id   = g.program_id
     WHERE si.staff_id = ${staffId}::uuid AND si.is_active

     ORDER BY kind, class_name, section_name
  `

  return rows.map((row) => ({
    kind: row.kind === 'daily' ? 'daily' : 'subject',
    sectionId: row.section_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    className: row.class_name,
    divisionName: row.division_name,
    programName: row.program_name,
    sectionName: row.section_name,
  }))
}

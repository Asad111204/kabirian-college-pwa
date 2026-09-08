/**
 * Staff attendance (Phase 22).
 *
 * The office takes one register a day for the whole staff: Present, Absent,
 * Short leave or Leave. There is no draft-then-submit ceremony — that exists
 * so a teacher can hand a class register in; this one is the office's own
 * record, so a mark is a fact the moment it is saved, and a change is a
 * correction with the office's name on it.
 *
 * Who appears on a day's register is worked out from employment dates, never
 * from anything the browser sends; every save is checked against the roster
 * the server rebuilt, so an id nobody expected is refused rather than stored.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { assertAdminArea } from './service-utils'
import { collegeDateToStorage, storageToCollegeDate, todayInCollegeTimezone } from '../time/college-date'
import {
  checkStaffAttendanceDate,
  countStaffStatuses,
  staffAttendancePercentage,
  wasEmployedOn,
  type StaffAttendanceCounts,
  type StaffAttendanceStatusValue,
} from '../staff-attendance/staff-attendance-policy'
import type {
  MyStaffAttendanceQuery,
  StaffAttendanceDayQuery,
  StaffAttendanceMonthQuery,
  StaffAttendanceSaveInput,
} from '@/validation/staff-attendance'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface StaffAttendanceRow {
  staffId: string
  staffCode: string
  fullName: string
  designation: string
  department: string | null
  staffType: string
  photoId: string | null
  /** Null when nobody has marked this person for this day yet. */
  status: StaffAttendanceStatusValue | null
  remarks: string | null
}

export interface StaffAttendanceDay {
  date: string
  /** True when the office may still mark it (never the future). */
  editable: boolean
  /** Why not, when it cannot be marked. */
  reason: string | null
  counts: StaffAttendanceCounts
  unmarked: number
  rows: StaffAttendanceRow[]
  departments: { id: string; name: string }[]
}

export interface StaffMonthRow {
  staffId: string
  staffCode: string
  fullName: string
  designation: string
  department: string | null
  counts: StaffAttendanceCounts
  /** How much of the marked month was worked; null when nothing counts yet. */
  percentage: number | null
}

export interface StaffAttendanceMonth {
  /** The first day of the month being shown, as a college date. */
  month: string
  monthLabel: string
  daysMarked: number
  rows: StaffMonthRow[]
  departments: { id: string; name: string }[]
}

export interface MyStaffAttendanceDay {
  date: string
  status: StaffAttendanceStatusValue
  remarks: string | null
}

export interface MyStaffAttendance {
  month: string
  monthLabel: string
  counts: StaffAttendanceCounts
  percentage: number | null
  days: MyStaffAttendanceDay[]
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function requireOffice(ctx: AuthContext, permission: 'staff_attendance.view' | 'staff_attendance.mark'): void {
  assertAdminArea(ctx, 'Staff attendance')
  authorize(ctx, permission)
}

/** The first and last college dates of the month a date falls in. */
function monthBounds(date: string): { first: string; last: string; label: string } {
  const [y, m] = date.split('-').map(Number)
  const first = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  const last = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, 1)))
  return { first, last, label }
}

const staffSelect = {
  id: true,
  staffCode: true,
  fullName: true,
  joiningDate: true,
  leavingDate: true,
  staffType: true,
  designation: { select: { name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.StaffSelect

function staffWhere(query: { departmentId?: string; staffType: 'TEACHING' | 'NON_TEACHING' | 'ALL' }): Prisma.StaffWhereInput {
  return {
    deletedAt: null,
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.staffType !== 'ALL' ? { staffType: query.staffType } : {}),
  }
}

async function departmentOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
  return rows
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** One day's register: everyone employed that day, with their mark if there is one. */
export async function getStaffAttendanceDay(ctx: AuthContext, query: StaffAttendanceDayQuery): Promise<StaffAttendanceDay> {
  requireOffice(ctx, 'staff_attendance.view')

  const today = todayInCollegeTimezone()
  const date = query.date ?? today
  const rule = checkStaffAttendanceDate(date, today)

  const [staff, marks, departments] = await Promise.all([
    prisma.staff.findMany({ where: staffWhere(query), orderBy: [{ fullName: 'asc' }], select: staffSelect }),
    prisma.staffAttendance.findMany({ where: { date: collegeDateToStorage(date) }, select: { staffId: true, status: true, remarks: true } }),
    departmentOptions(),
  ])
  const byStaff = new Map(marks.map((m) => [m.staffId, m]))

  const employed = staff.filter((s) =>
    wasEmployedOn({ joiningDate: storageToCollegeDate(s.joiningDate), leavingDate: s.leavingDate ? storageToCollegeDate(s.leavingDate) : null }, date),
  )

  const { currentPhotoIds } = await import('./documents.service')
  const photos = await currentPhotoIds('STAFF', employed.map((s) => s.id))

  const rows: StaffAttendanceRow[] = employed.map((s) => ({
    staffId: s.id,
    staffCode: s.staffCode,
    fullName: s.fullName,
    designation: s.designation.name,
    department: s.department?.name ?? null,
    staffType: s.staffType,
    photoId: photos.get(s.id) ?? null,
    status: (byStaff.get(s.id)?.status as StaffAttendanceStatusValue) ?? null,
    remarks: byStaff.get(s.id)?.remarks ?? null,
  }))

  const counts = countStaffStatuses(rows.map((r) => r.status).filter((s): s is StaffAttendanceStatusValue => s !== null))

  return {
    date,
    editable: rule.allowed,
    reason: rule.allowed ? null : rule.reason,
    counts,
    unmarked: rows.length - counts.marked,
    rows,
    departments,
  }
}

/** One month, one row per staff member, counted and turned into a percentage. */
export async function getStaffAttendanceMonth(ctx: AuthContext, query: StaffAttendanceMonthQuery): Promise<StaffAttendanceMonth> {
  requireOffice(ctx, 'staff_attendance.view')

  const { first, last, label } = monthBounds(query.month ?? todayInCollegeTimezone())
  const [staff, marks, departments] = await Promise.all([
    prisma.staff.findMany({ where: staffWhere(query), orderBy: [{ fullName: 'asc' }], select: staffSelect }),
    prisma.staffAttendance.findMany({
      where: { date: { gte: collegeDateToStorage(first), lte: collegeDateToStorage(last) } },
      select: { staffId: true, status: true, date: true },
    }),
    departmentOptions(),
  ])

  const byStaff = new Map<string, StaffAttendanceStatusValue[]>()
  const days = new Set<string>()
  for (const mark of marks) {
    days.add(storageToCollegeDate(mark.date))
    const list = byStaff.get(mark.staffId) ?? []
    list.push(mark.status as StaffAttendanceStatusValue)
    byStaff.set(mark.staffId, list)
  }

  const rows: StaffMonthRow[] = staff.map((s) => {
    const counts = countStaffStatuses(byStaff.get(s.id) ?? [])
    return {
      staffId: s.id,
      staffCode: s.staffCode,
      fullName: s.fullName,
      designation: s.designation.name,
      department: s.department?.name ?? null,
      counts,
      percentage: staffAttendancePercentage(counts),
    }
  })

  return { month: first, monthLabel: label, daysMarked: days.size, rows, departments }
}

/** A staff member's own month. Their own record, so nothing is withheld. */
export async function getMyStaffAttendance(ctx: AuthContext, query: MyStaffAttendanceQuery): Promise<MyStaffAttendance> {
  authorize(ctx, 'dashboard.view')
  if (!ctx.staffId) throw new ForbiddenError('Your login is not linked to a staff record.')

  const { first, last, label } = monthBounds(query.month ?? todayInCollegeTimezone())
  const marks = await prisma.staffAttendance.findMany({
    where: { staffId: ctx.staffId, date: { gte: collegeDateToStorage(first), lte: collegeDateToStorage(last) } },
    orderBy: { date: 'asc' },
    select: { date: true, status: true, remarks: true },
  })

  const counts = countStaffStatuses(marks.map((m) => m.status as StaffAttendanceStatusValue))
  return {
    month: first,
    monthLabel: label,
    counts,
    percentage: staffAttendancePercentage(counts),
    days: marks.map((m) => ({ date: storageToCollegeDate(m.date), status: m.status as StaffAttendanceStatusValue, remarks: m.remarks })),
  }
}

/* -------------------------------------------------------------------------- */
/* Marking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Saves one day's marks.
 *
 * The roster is rebuilt here: an id that does not belong to somebody employed
 * that day is refused outright rather than skipped, because it means the
 * screen and the server disagree and quietly dropping it would hide that.
 * Existing marks are updated, new ones created; nothing is deleted, so a day
 * that was marked stays marked.
 */
export async function saveStaffAttendance(
  ctx: AuthContext,
  input: StaffAttendanceSaveInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<StaffAttendanceDay> {
  requireOffice(ctx, 'staff_attendance.mark')

  const today = todayInCollegeTimezone()
  const rule = checkStaffAttendanceDate(input.date, today)
  if (!rule.allowed) throw new ValidationError(rule.reason, { date: [rule.reason] })

  const staff = await prisma.staff.findMany({
    where: { id: { in: input.entries.map((e) => e.staffId) }, deletedAt: null },
    select: { id: true, fullName: true, joiningDate: true, leavingDate: true },
  })
  const byId = new Map(staff.map((s) => [s.id, s]))

  for (const entry of input.entries) {
    const member = byId.get(entry.staffId)
    if (!member) throw new NotFoundError('staff member')
    const employed = wasEmployedOn(
      { joiningDate: storageToCollegeDate(member.joiningDate), leavingDate: member.leavingDate ? storageToCollegeDate(member.leavingDate) : null },
      input.date,
    )
    if (!employed) {
      throw new ValidationError(`${member.fullName} was not employed on ${input.date}, so they cannot be marked for that day.`)
    }
  }

  const date = collegeDateToStorage(input.date)
  const existing = await prisma.staffAttendance.findMany({
    where: { date, staffId: { in: input.entries.map((e) => e.staffId) } },
    select: { staffId: true, status: true },
  })
  const before = new Map(existing.map((e) => [e.staffId, e.status as StaffAttendanceStatusValue]))
  const changed = input.entries.filter((e) => before.get(e.staffId) !== e.status)
  const corrections = changed.filter((e) => before.has(e.staffId)).length

  await prisma.$transaction(async (tx) => {
    for (const entry of input.entries) {
      await tx.staffAttendance.upsert({
        where: { staffId_date: { staffId: entry.staffId, date } },
        create: { staffId: entry.staffId, date, status: entry.status, remarks: entry.remarks ?? null, markedByUserId: ctx.userId },
        update: { status: entry.status, remarks: entry.remarks ?? null, markedByUserId: ctx.userId },
      })
    }

    if (changed.length > 0) {
      await writeAuditLog(
        ctx,
        {
          action: corrections > 0 ? 'staff_attendance.corrected' : 'staff_attendance.marked',
          entityType: 'staff_attendance',
          entityLabel: `Staff register · ${input.date}`,
          metadata: { date: input.date, marksChanged: changed.length, corrections },
          request,
        },
        tx,
      )
    }
  })

  return getStaffAttendanceDay(ctx, { date: input.date, staffType: 'ALL' })
}

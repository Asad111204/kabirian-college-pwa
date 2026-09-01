/**
 * The weekly master timetable.
 *
 * This is the only place a timetable slot may be written or read. Every
 * function takes an AuthContext and checks permission first (ADR-008), and
 * nothing the browser sends is trusted as proof of anything:
 *
 *   - the **teacher** reading their own week is `ctx.staffId`, resolved from
 *     the session cookie. There is no `staffId` parameter to forge.
 *   - the **session** a lesson belongs to comes from its section, never from
 *     the request — the composite foreign key makes any other combination
 *     unstorable anyway.
 *   - the **subject** must be on the section's curriculum, and the **teacher**
 *     must hold an ACTIVE `TeacherAssignment` for that section and subject.
 *     That is the same authority attendance and marks answer to; there is no
 *     second teacher-subject system (ADR-008).
 *
 * The rules themselves — what clashes, what may be scheduled — live in
 * `timetable/timetable-policy.ts` as pure functions. This file does the lookups
 * and the writing.
 *
 * There is deliberately no student-facing function here. The college asked for
 * an admin master timetable and a teacher's own view, and nothing else.
 *
 * Clashes are refused twice over. `assertLessonIsAllowed` checks first, because
 * a person needs to be told which lesson is in the way; three partial unique
 * indexes then refuse the write outright, which is what holds when two
 * administrators save the same period at the same moment and each passes its
 * own check before either has written.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { todayInCollegeTimezone, todaysCollegeWeekday } from '../time/college-date'
import { PERIODS, type CollegePeriod } from '../timetable/periods'
import {
  decidePeriodAllowed,
  decideSubjectAllowed,
  decideTeacherAllowed,
  findTimetableClashes,
  type ProposedSlot,
  type TimetableSlotFacts,
} from '../timetable/timetable-policy'
import { assertAdminArea, withUniqueConstraintHandling } from './service-utils'
import type {
  DayOfWeekValue,
  MyTimetableQuery,
  TimetableListQuery,
  TimetableSlotCreateInput,
  TimetableSlotUpdateInput,
} from '@/validation/timetable'

/* ========================================================================== */
/* Shapes                                                                     */
/* ========================================================================== */

/** One lesson, as every screen shows it. */
export interface TimetableSlotRow {
  id: string
  dayOfWeek: DayOfWeekValue
  period: number
  startTime: string
  endTime: string
  subjectId: string
  subjectName: string
  staffId: string
  staffName: string
  staffCode: string
  room: string | null
}

/** A section, named the way the college names it. */
export interface TimetableSectionSummary {
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  academicSessionId: string
  sessionName: string
}

/** A teacher who may be put against a subject in this section. */
export interface EligibleTeacher {
  staffId: string
  fullName: string
  staffCode: string
}

/** What the admin builder may offer for one section. */
export interface TimetableSubjectOption {
  subjectId: string
  subjectName: string
  subjectCode: string | null
  /** Teachers holding an ACTIVE assignment for this section and subject. */
  teachers: EligibleTeacher[]
}

export interface SectionTimetable {
  section: TimetableSectionSummary
  periods: readonly CollegePeriod[]
  slots: TimetableSlotRow[]
  subjects: TimetableSubjectOption[]
}

/**
 * One lesson as the office lists it: everything a grid needs to draw a cell,
 * with the clock times filled in from `periods.ts` rather than the database.
 */
export interface TimetableListRow extends TimetableSlotRow {
  academicSessionId: string
  sessionName: string
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  isActive: boolean
}

export interface TimetableSessionOption {
  id: string
  name: string
  isCurrent: boolean
}

export interface TimetableOptions {
  /** Every session the college has, newest first. */
  sessions: TimetableSessionOption[]
  /** The one these sections belong to: the one asked for, else the current. */
  selectedSessionId: string | null
  /** Kept so callers that only ever wanted "this year" still work. */
  currentSession: { id: string; name: string } | null
  sections: TimetableSectionSummary[]
}

/** A teacher's own week. */
export interface TeacherTimetable {
  sessionName: string | null
  periods: readonly CollegePeriod[]
  lessons: TeacherLesson[]
}

/** One lesson on a teacher's timetable — where it is, and what it is. */
export interface TeacherLesson {
  id: string
  dayOfWeek: DayOfWeekValue
  period: number
  startTime: string
  endTime: string
  subjectId: string
  subjectName: string
  sectionId: string
  sectionName: string
  className: string
  divisionName: string
  programName: string
  room: string | null
}

export interface TodayClasses {
  /** The college's own date and weekday, not the browser's. */
  date: string
  dayOfWeek: DayOfWeekValue
  lessons: TeacherLesson[]
}

/* ========================================================================== */
/* Shared lookups                                                             */
/* ========================================================================== */

const SECTION_INCLUDE = {
  academicGroup: {
    include: { class: true, division: true, program: true, academicSession: true },
  },
} as const

type SectionWithGroup = {
  id: string
  name: string
  academicSessionId: string
  academicGroup: {
    classId: string
    programId: string
    class: { name: string }
    division: { name: string }
    program: { name: string }
    academicSession: { name: string }
  }
}

function toSectionSummary(section: SectionWithGroup): TimetableSectionSummary {
  return {
    sectionId: section.id,
    sectionName: section.name,
    className: section.academicGroup.class.name,
    divisionName: section.academicGroup.division.name,
    programName: section.academicGroup.program.name,
    academicSessionId: section.academicSessionId,
    sessionName: section.academicGroup.academicSession.name,
  }
}

const periodOf = (period: number): CollegePeriod | null =>
  PERIODS.find((p) => p.period === period) ?? null

/** Everything a listed lesson names, in one query. */
const LIST_INCLUDE = {
  subject: { select: { id: true, name: true } },
  staff: { select: { id: true, fullName: true, staffCode: true } },
  section: {
    include: {
      academicGroup: {
        include: { class: true, division: true, program: true, academicSession: true },
      },
    },
  },
} as const

interface ListedSlot {
  id: string
  academicSessionId: string
  dayOfWeek: string
  period: number
  room: string | null
  isActive: boolean
  subject: { id: string; name: string }
  staff: { id: string; fullName: string; staffCode: string }
  section: {
    id: string
    name: string
    academicGroup: {
      class: { name: string }
      division: { name: string }
      program: { name: string }
      academicSession: { name: string }
    }
  }
}

function toListRow(slot: ListedSlot): TimetableListRow {
  const period = periodOf(slot.period)
  return {
    id: slot.id,
    academicSessionId: slot.academicSessionId,
    sessionName: slot.section.academicGroup.academicSession.name,
    sectionId: slot.section.id,
    sectionName: slot.section.name,
    className: slot.section.academicGroup.class.name,
    divisionName: slot.section.academicGroup.division.name,
    programName: slot.section.academicGroup.program.name,
    dayOfWeek: slot.dayOfWeek as DayOfWeekValue,
    period: slot.period,
    // Never stored. The college's bell schedule lives in periods.ts.
    startTime: period?.start ?? '',
    endTime: period?.end ?? '',
    subjectId: slot.subject.id,
    subjectName: slot.subject.name,
    staffId: slot.staff.id,
    staffName: slot.staff.fullName,
    staffCode: slot.staff.staffCode,
    room: slot.room,
    isActive: slot.isActive,
  }
}

/* ========================================================================== */
/* Admin: reading the master timetable                                        */
/* ========================================================================== */

/** Every admin function goes through here first. */
function requireTimetableAdmin(ctx: AuthContext, permission: string): void {
  authorize(ctx, permission)
  assertAdminArea(ctx, 'Timetable management')
}

/**
 * What the builder may offer: the college's sessions, and the sections of
 * whichever one is being looked at.
 *
 * `sessionId` chooses; without it the current session is used. A timetable is
 * built one year at a time, so the sections never come from more than one — a
 * section picked in 2026-27 cannot survive a switch to 2027-28, and the caller
 * is given the list to prove it.
 */
export async function getTimetableOptions(
  ctx: AuthContext,
  sessionId?: string,
): Promise<TimetableOptions> {
  requireTimetableAdmin(ctx, 'timetable.view')

  const sessions = await prisma.academicSession.findMany({
    select: { id: true, name: true, isCurrent: true },
    orderBy: { startDate: 'desc' },
  })

  const current = sessions.find((s) => s.isCurrent) ?? null
  const selected = sessionId
    ? (sessions.find((s) => s.id === sessionId) ?? null)
    : (current ?? sessions[0] ?? null)

  const currentSession = current ? { id: current.id, name: current.name } : null

  if (!selected) return { sessions, selectedSessionId: null, currentSession, sections: [] }

  const sections = await prisma.section.findMany({
    where: { academicSessionId: selected.id, isActive: true },
    include: SECTION_INCLUDE,
    orderBy: [
      { academicGroup: { class: { level: 'asc' } } },
      { academicGroup: { division: { sortOrder: 'asc' } } },
      { academicGroup: { program: { sortOrder: 'asc' } } },
      { name: 'asc' },
    ],
  })

  return {
    sessions,
    selectedSessionId: selected.id,
    currentSession,
    sections: sections.map(toSectionSummary),
  }
}

/**
 * The master timetable, filtered.
 *
 * Scoped to one academic session always — a timetable means nothing outside
 * one — and optionally to a section and a day. Removed lessons are left out
 * unless the office asks for them: they are history, and history does not
 * belong on a grid somebody is about to teach from.
 */
export async function listTimetable(
  ctx: AuthContext,
  query: TimetableListQuery,
): Promise<TimetableListRow[]> {
  requireTimetableAdmin(ctx, 'timetable.view')

  const slots = await prisma.timetableSlot.findMany({
    where: {
      academicSessionId: query.academicSessionId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
    },
    include: LIST_INCLUDE,
    orderBy: [{ section: { name: 'asc' } }, { dayOfWeek: 'asc' }, { period: 'asc' }],
  })

  return slots.map(toListRow)
}

/**
 * One lesson.
 *
 * A removed lesson is still a lesson and is returned, marked inactive — only a
 * slot that genuinely does not exist is a 404.
 */
export async function getTimetableSlot(
  ctx: AuthContext,
  slotId: string,
): Promise<TimetableListRow> {
  requireTimetableAdmin(ctx, 'timetable.view')

  const slot = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
    include: LIST_INCLUDE,
  })
  if (!slot) throw new NotFoundError('That lesson does not exist.')
  return toListRow(slot)
}

async function loadSection(sectionId: string): Promise<SectionWithGroup> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: SECTION_INCLUDE,
  })
  if (!section) throw new NotFoundError('That section does not exist.')
  return section
}

/**
 * What a section studies, and who may teach each of it.
 *
 * The subject list is the **curriculum** for the section's class and programme,
 * not every subject in the college; the teacher list under each subject is the
 * set holding an ACTIVE assignment for that section and subject. The builder
 * offers exactly these, and the service checks the same two things again before
 * writing — the dropdowns stop the mistake, the service stops the request.
 */
async function loadSubjectOptions(section: SectionWithGroup): Promise<TimetableSubjectOption[]> {
  const [curriculum, assignments] = await Promise.all([
    prisma.curriculumSubject.findMany({
      where: {
        academicSessionId: section.academicSessionId,
        classId: section.academicGroup.classId,
        programId: section.academicGroup.programId,
      },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: [{ sortOrder: 'asc' }, { subject: { name: 'asc' } }],
    }),
    prisma.teacherAssignment.findMany({
      where: { sectionId: section.id, isActive: true },
      include: { staff: { select: { id: true, fullName: true, staffCode: true } } },
    }),
  ])

  const teachersBySubject = new Map<string, EligibleTeacher[]>()
  for (const assignment of assignments) {
    const list = teachersBySubject.get(assignment.subjectId) ?? []
    list.push({
      staffId: assignment.staff.id,
      fullName: assignment.staff.fullName,
      staffCode: assignment.staff.staffCode,
    })
    teachersBySubject.set(assignment.subjectId, list)
  }

  return curriculum.map((row) => ({
    subjectId: row.subject.id,
    subjectName: row.subject.name,
    subjectCode: row.subject.code,
    teachers: (teachersBySubject.get(row.subject.id) ?? []).sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    ),
  }))
}

const SLOT_INCLUDE = {
  subject: { select: { id: true, name: true } },
  staff: { select: { id: true, fullName: true, staffCode: true } },
} as const

function toSlotRow(slot: {
  id: string
  dayOfWeek: string
  period: number
  room: string | null
  subject: { id: string; name: string }
  staff: { id: string; fullName: string; staffCode: string }
}): TimetableSlotRow {
  const period = periodOf(slot.period)
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek as DayOfWeekValue,
    period: slot.period,
    startTime: period?.start ?? '',
    endTime: period?.end ?? '',
    subjectId: slot.subject.id,
    subjectName: slot.subject.name,
    staffId: slot.staff.id,
    staffName: slot.staff.fullName,
    staffCode: slot.staff.staffCode,
    room: slot.room,
  }
}

/** One section's week, plus everything the builder is allowed to put in it. */
export async function getSectionTimetable(
  ctx: AuthContext,
  sectionId: string,
): Promise<SectionTimetable> {
  requireTimetableAdmin(ctx, 'timetable.view')

  const section = await loadSection(sectionId)
  const [slots, subjects] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { sectionId: section.id, isActive: true },
      include: SLOT_INCLUDE,
      orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
    }),
    loadSubjectOptions(section),
  ])

  return {
    section: toSectionSummary(section),
    periods: PERIODS,
    slots: slots.map(toSlotRow),
    subjects,
  }
}

/* ========================================================================== */
/* Admin: writing                                                             */
/* ========================================================================== */

/**
 * The three partial unique indexes that make a clash impossible, and what to
 * say when one of them fires.
 *
 * `assertLessonIsAllowed` normally catches all three first and produces a
 * better message — it can name the lesson in the way. These indexes exist for
 * the case it cannot cover: two administrators saving the same period at the
 * same moment, each passing its own check before either has written. The
 * database settles that whatever order they arrive in.
 *
 * Keyed by a fragment of the index name; `withUniqueConstraintHandling` matches
 * on it and turns the violation into a 409 with the message against the right
 * form field.
 */
const CLASH_MESSAGES: Record<string, string> = {
  staff_id: 'This teacher is already taking another lesson in this period.',
  room: 'This room is already in use in this period.',
  section_id: 'This section already has a lesson in this period.',
}

const CLASH_FALLBACK = 'Something else is already booked in this period.'

/** Turns a policy refusal into the error the API should return. */
function assertAllowed(decision: ReturnType<typeof decideSubjectAllowed>, field: string): void {
  if (!decision.allowed) {
    throw new ValidationError(decision.reason, { [field]: [decision.reason] })
  }
}

/**
 * Everything already booked in this cell, across the whole session.
 *
 * Deliberately not narrowed to the section: a teacher and a room are shared, so
 * their clashes can only be seen by looking at every section's lesson in that
 * period. The set is small — at most one row per section — and the
 * `(session, day, period)` index serves it directly.
 */
async function loadCellOccupants(
  academicSessionId: string,
  dayOfWeek: DayOfWeekValue,
  period: number,
): Promise<TimetableSlotFacts[]> {
  const rows = await prisma.timetableSlot.findMany({
    where: { academicSessionId, dayOfWeek, period, isActive: true },
    select: {
      id: true,
      academicSessionId: true,
      sectionId: true,
      staffId: true,
      room: true,
      dayOfWeek: true,
      period: true,
      isActive: true,
    },
  })
  return rows as TimetableSlotFacts[]
}

/**
 * Checks a proposed lesson against every rule, and throws the first refusal.
 *
 * Order matters only for the message the admin sees; each check is independent.
 * Clashes are reported together, because a cell can be wrong in more than one
 * way at once and sending the admin round the loop three times would be rude.
 */
async function assertLessonIsAllowed(
  section: SectionWithGroup,
  proposed: ProposedSlot,
  subjectId: string,
): Promise<void> {
  assertAllowed(decidePeriodAllowed(proposed.period), 'period')

  const subjects = await loadSubjectOptions(section)
  assertAllowed(
    decideSubjectAllowed({ subjectIds: subjects.map((s) => s.subjectId) }, subjectId),
    'subjectId',
  )

  const assignments = await prisma.teacherAssignment.findMany({
    where: { sectionId: section.id, subjectId, staffId: proposed.staffId },
    select: { staffId: true, sectionId: true, subjectId: true, isActive: true },
  })
  assertAllowed(
    decideTeacherAllowed(assignments, {
      staffId: proposed.staffId,
      sectionId: section.id,
      subjectId,
    }),
    'staffId',
  )

  const occupants = await loadCellOccupants(
    section.academicSessionId,
    proposed.dayOfWeek,
    proposed.period,
  )
  const clashes = findTimetableClashes(proposed, occupants)
  if (clashes.length > 0) {
    // Every clash the admin has to fix, in one message and against the field
     // that caused it, so the builder can highlight the right box.
    const fields: Record<string, string[]> = {}
    for (const clash of clashes) {
      const field = clash.kind === 'TEACHER' ? 'staffId' : clash.kind === 'ROOM' ? 'room' : 'period'
      fields[field] = [...(fields[field] ?? []), clash.reason]
    }
    throw new ConflictError(clashes.map((c) => c.reason).join(' '), fields)
  }
}

/** Puts a lesson in an empty cell. */
export async function createTimetableSlot(
  ctx: AuthContext,
  input: TimetableSlotCreateInput,
): Promise<TimetableSlotRow> {
  requireTimetableAdmin(ctx, 'timetable.manage')

  const section = await loadSection(input.sectionId)

  // A session may be sent, but only so it can be checked. If the caller thinks
  // this section is in a different year from the one the database records, that
  // is a mistake worth showing rather than silently overruling.
  if (input.academicSessionId && input.academicSessionId !== section.academicSessionId) {
    throw new ValidationError('That section does not belong to that academic session.', {
      academicSessionId: ['That section does not belong to that academic session.'],
    })
  }

  const proposed: ProposedSlot = {
    academicSessionId: section.academicSessionId,
    sectionId: section.id,
    staffId: input.staffId,
    room: input.room ?? null,
    dayOfWeek: input.dayOfWeek,
    period: input.period,
  }
  await assertLessonIsAllowed(section, proposed, input.subjectId)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.timetableSlot.create({
        data: {
          sectionId: section.id,
          // From the section, never from the request.
          academicSessionId: section.academicSessionId,
          subjectId: input.subjectId,
          staffId: input.staffId,
          dayOfWeek: input.dayOfWeek,
          period: input.period,
          room: input.room ?? null,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        },
        include: SLOT_INCLUDE,
      }),
    CLASH_MESSAGES,
    CLASH_FALLBACK,
  )

  const row = toSlotRow(created)
  await writeAuditLog(ctx, {
    action: 'timetable_slot.created',
    entityType: 'TimetableSlot',
    entityId: created.id,
    entityLabel: `${row.subjectName} · ${section.name} · ${row.dayOfWeek} period ${row.period}`,
    after: row,
  })
  return row
}

/** Changes what happens in a cell that already has a lesson in it. */
export async function updateTimetableSlot(
  ctx: AuthContext,
  slotId: string,
  input: TimetableSlotUpdateInput,
): Promise<TimetableSlotRow> {
  requireTimetableAdmin(ctx, 'timetable.manage')

  const existing = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
    include: SLOT_INCLUDE,
  })
  if (!existing || !existing.isActive) throw new NotFoundError('That lesson does not exist.')

  const section = await loadSection(existing.sectionId)

  const proposed: ProposedSlot = {
    id: existing.id,
    academicSessionId: section.academicSessionId,
    sectionId: section.id,
    staffId: input.staffId,
    room: input.room ?? null,
    dayOfWeek: existing.dayOfWeek as DayOfWeekValue,
    period: existing.period,
  }
  await assertLessonIsAllowed(section, proposed, input.subjectId)

  const before = toSlotRow(existing)
  // Wrapped for the same reason a create is: moving a teacher or a room into a
  // cell another administrator is filling at that moment is the same race.
  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.timetableSlot.update({
        where: { id: slotId },
        data: {
          subjectId: input.subjectId,
          staffId: input.staffId,
          room: input.room ?? null,
          updatedByUserId: ctx.userId,
        },
        include: SLOT_INCLUDE,
      }),
    CLASH_MESSAGES,
    CLASH_FALLBACK,
  )

  const after = toSlotRow(updated)

  // Only the fields that actually moved. An audit trail that records a change
  // where nothing changed teaches the reader to ignore it.
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of ['subjectName', 'staffName', 'room'] as const) {
    if (before[field] !== after[field]) changed[field] = { from: before[field], to: after[field] }
  }

  if (Object.keys(changed).length > 0) {
    await writeAuditLog(ctx, {
      action: 'timetable_slot.updated',
      entityType: 'TimetableSlot',
      entityId: slotId,
      entityLabel: `${after.subjectName} · ${section.name} · ${after.dayOfWeek} period ${after.period}`,
      before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])),
      after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])),
      metadata: { changedFields: Object.keys(changed) },
    })
  }

  return after
}

/**
 * Empties a cell.
 *
 * The row is deactivated rather than deleted, so the change is still auditable
 * — and because the section's uniqueness index only counts ACTIVE rows, the
 * cell is genuinely free again afterwards.
 */
export async function deactivateTimetableSlot(ctx: AuthContext, slotId: string): Promise<void> {
  requireTimetableAdmin(ctx, 'timetable.manage')

  const existing = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
    include: SLOT_INCLUDE,
  })
  if (!existing || !existing.isActive) throw new NotFoundError('That lesson does not exist.')

  await prisma.timetableSlot.update({
    where: { id: slotId },
    data: { isActive: false, updatedByUserId: ctx.userId },
  })

  await writeAuditLog(ctx, {
    action: 'timetable_slot.deactivated',
    entityType: 'TimetableSlot',
    entityId: slotId,
    entityLabel: `${existing.subject.name} · ${existing.dayOfWeek} period ${existing.period}`,
    before: toSlotRow(existing),
  })
}

/* ========================================================================== */
/* Teacher: their own week                                                    */
/* ========================================================================== */

/**
 * The signed-in teacher's staff id.
 *
 * `ctx.staffId` and nothing else. There is no parameter for whose timetable it
 * is, so a teacher cannot ask for another teacher's week by changing a value in
 * the request — the same rule the student result portal follows (ADR-135).
 */
function requireOwnStaffId(ctx: AuthContext): string {
  authorize(ctx, 'timetable.view')

  if (ctx.role !== 'STAFF' || !ctx.staffId) {
    throw new ForbiddenError('This is only available to a staff account.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
  return ctx.staffId
}

const LESSON_INCLUDE = {
  subject: { select: { id: true, name: true } },
  section: {
    include: { academicGroup: { include: { class: true, division: true, program: true } } },
  },
} as const

function toTeacherLesson(slot: {
  id: string
  dayOfWeek: string
  period: number
  room: string | null
  subject: { id: string; name: string }
  section: {
    id: string
    name: string
    academicGroup: { class: { name: string }; division: { name: string }; program: { name: string } }
  }
}): TeacherLesson {
  const period = periodOf(slot.period)
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek as DayOfWeekValue,
    period: slot.period,
    startTime: period?.start ?? '',
    endTime: period?.end ?? '',
    subjectId: slot.subject.id,
    subjectName: slot.subject.name,
    sectionId: slot.section.id,
    sectionName: slot.section.name,
    className: slot.section.academicGroup.class.name,
    divisionName: slot.section.academicGroup.division.name,
    programName: slot.section.academicGroup.program.name,
    room: slot.room,
  }
}

/** The current session, or null when the college has not set one. */
async function currentSession() {
  return prisma.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  })
}

/**
 * The signed-in teacher's own week.
 *
 * `filters` may narrow it to a session or a day. It cannot widen it: whose
 * timetable this is comes from `ctx.staffId`, which is not a parameter, so
 * every query below is already inside one teacher's own lessons.
 */
export async function getMyTimetable(
  ctx: AuthContext,
  filters: MyTimetableQuery = {},
): Promise<TeacherTimetable> {
  const staffId = requireOwnStaffId(ctx)

  const session = filters.academicSessionId
    ? await prisma.academicSession.findUnique({
        where: { id: filters.academicSessionId },
        select: { id: true, name: true },
      })
    : await currentSession()
  if (!session) return { sessionName: null, periods: PERIODS, lessons: [] }

  const slots = await prisma.timetableSlot.findMany({
    where: {
      staffId,
      academicSessionId: session.id,
      isActive: true,
      ...(filters.dayOfWeek ? { dayOfWeek: filters.dayOfWeek } : {}),
    },
    include: LESSON_INCLUDE,
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  })

  return {
    sessionName: session.name,
    periods: PERIODS,
    lessons: slots.map(toTeacherLesson),
  }
}

/**
 * What the signed-in teacher is teaching today.
 *
 * "Today" is the college's own date and weekday (Asia/Karachi), not the
 * browser's and not the server's — a laptop with a wrong clock must not change
 * which lessons a teacher is told to take.
 */
export async function getMyClassesToday(ctx: AuthContext): Promise<TodayClasses> {
  const staffId = requireOwnStaffId(ctx)

  const date = todayInCollegeTimezone()
  const dayOfWeek = todaysCollegeWeekday() as DayOfWeekValue

  const session = await currentSession()
  if (!session) return { date, dayOfWeek, lessons: [] }

  const slots = await prisma.timetableSlot.findMany({
    where: { staffId, academicSessionId: session.id, dayOfWeek, isActive: true },
    include: LESSON_INCLUDE,
    orderBy: { period: 'asc' },
  })

  return { date, dayOfWeek, lessons: slots.map(toTeacherLesson) }
}

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
import { findPeriodIn, type CollegePeriod } from '../timetable/periods'
import { getCollegePeriods } from '../timetable/period-settings'
import {
  decidePeriodAllowed,
  decideSubjectAllowed,
  decideTeacherAllowed,
  findTimetableClashes,
  type ProposedSlot,
  type TimetableSlotFacts,
} from '../timetable/timetable-policy'
import { assertAdminArea, withUniqueConstraintHandling } from './service-utils'
import { DAY_LABEL } from '@/validation/timetable'
import type {
  DayOfWeekValue,
  MyTimetableQuery,
  TimetableCopyDayInput,
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
  /**
   * Every section sitting in this lesson. A grid drawing one section's week
   * uses it to say "also taught to …", and the edit form to prefill them.
   */
  sectionIds: string[]
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
  /**
   * Every section sitting in this lesson. A class taught together names them
   * all, which is how a grid draws one cell across more than one column.
   */
  sections: TimetableSectionSummary[]
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
  /**
   * Every section in the room for this lesson. Usually one; more when the
   * college teaches sections together, which the teacher needs to see because
   * it is who is actually in front of them.
   */
  sections: { sectionId: string; sectionName: string; className: string; divisionName: string; programName: string }[]
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

/**
 * The clock times for a period number.
 *
 * The grid is the college's own and editable, so it is read once per request
 * and passed down rather than imported as a constant. A lesson whose period is
 * no longer in the grid still displays; it simply shows no times, which is the
 * truth about it.
 */
const periodOf = (periods: readonly CollegePeriod[], period: number): CollegePeriod | null =>
  findPeriodIn(periods, period)

/** Everything a listed lesson names, in one query. */
const LIST_INCLUDE = {
  subject: { select: { id: true, name: true } },
  staff: { select: { id: true, fullName: true, staffCode: true } },
  sections: {
    include: {
      section: {
        include: {
          academicGroup: {
            include: { class: true, division: true, program: true, academicSession: true },
          },
        },
      },
    },
  },
} as const

interface ListedSection {
  section: {
    id: string
    name: string
    academicSessionId: string
    academicGroup: {
      class: { name: string }
      division: { name: string }
      program: { name: string }
      academicSession: { name: string }
    }
  }
}

/** The same summary as `toSectionSummary`, from the narrower listed shape. */
function listedSectionSummary(section: ListedSection['section']): TimetableSectionSummary {
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

interface ListedSlot {
  id: string
  academicSessionId: string
  dayOfWeek: string
  period: number
  room: string | null
  isActive: boolean
  subject: { id: string; name: string }
  staff: { id: string; fullName: string; staffCode: string }
  sections: ListedSection[]
}

function toListRow(slot: ListedSlot, periods: readonly CollegePeriod[]): TimetableListRow {
  const period = periodOf(periods, slot.period)
  const sections = slot.sections.map((row) => listedSectionSummary(row.section))
  return {
    id: slot.id,
    academicSessionId: slot.academicSessionId,
    sessionName: slot.sections[0]?.section.academicGroup.academicSession.name ?? '',
    sections,
    sectionIds: sections.map((section) => section.sectionId),
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
      // A lesson is asked for by section through its list of them, so a class
      // taught together is found by every section sitting in it.
      ...(query.sectionId ? { sections: { some: { sectionId: query.sectionId } } } : {}),
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
    },
    include: LIST_INCLUDE,
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  })

  const periods = await getCollegePeriods()
  return slots.map((slot) => toListRow(slot, periods))
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
  return toListRow(slot, await getCollegePeriods())
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
 * Every section a lesson is to cover, in the order the caller listed them.
 *
 * One that does not exist is a refusal for the whole lesson rather than a
 * lesson quietly covering fewer sections than the office asked for.
 */
async function loadSections(sectionIds: readonly string[]): Promise<SectionWithGroup[]> {
  const unique = [...new Set(sectionIds)]
  const sections = await prisma.section.findMany({
    where: { id: { in: unique } },
    include: SECTION_INCLUDE,
  })
  if (sections.length !== unique.length) throw new NotFoundError('One of those sections does not exist.')
  return unique.map((id) => sections.find((section) => section.id === id)!)
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
  sections: { where: { isActive: true }, select: { sectionId: true } },
} as const

function toSlotRow(slot: {
  id: string
  dayOfWeek: string
  period: number
  room: string | null
  subject: { id: string; name: string }
  staff: { id: string; fullName: string; staffCode: string }
  sections: { sectionId: string }[]
}, periods: readonly CollegePeriod[]): TimetableSlotRow {
  const period = periodOf(periods, slot.period)
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
    sectionIds: slot.sections.map((row) => row.sectionId),
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
      where: { sections: { some: { sectionId: section.id, isActive: true } }, isActive: true },
      include: SLOT_INCLUDE,
      orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
    }),
    loadSubjectOptions(section),
  ])

  const periods = await getCollegePeriods()
  return {
    section: toSectionSummary(section),
    periods,
    slots: slots.map((slot) => toSlotRow(slot, periods)),
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
      subjectId: true,
      staffId: true,
      room: true,
      dayOfWeek: true,
      period: true,
      isActive: true,
      sections: { where: { isActive: true }, select: { sectionId: true } },
    },
  })
  return rows.map((row) => ({ ...row, sectionIds: row.sections.map((s) => s.sectionId) }))
}

/**
 * Checks a proposed lesson against every rule, and throws the first refusal.
 *
 * Order matters only for the message the admin sees; each check is independent.
 * Clashes are reported together, because a cell can be wrong in more than one
 * way at once and sending the admin round the loop three times would be rude.
 */
async function assertLessonIsAllowed(
  sections: readonly SectionWithGroup[],
  proposed: ProposedSlot,
  subjectId: string,
): Promise<void> {
  // The period must be one the college actually has. Which those are is the
  // college's own editable grid, so it is read rather than assumed — and there
  // is no break to refuse any more: a break is a period nobody fills.
  assertAllowed(decidePeriodAllowed(proposed.period, await getCollegePeriods()), 'period')

  // Every section must study the subject, and the teacher must be assigned it
  // in every one of them. A class taught together is still each section's own
  // lesson as far as the curriculum and the assignments are concerned, and one
  // section that does not take the subject is enough to refuse the lot.
  for (const section of sections) {
    const subjects = await loadSubjectOptions(section)
    const decision = decideSubjectAllowed({ subjectIds: subjects.map((s) => s.subjectId) }, subjectId)
    if (!decision.allowed) {
      throw new ConflictError(
        sections.length === 1
          ? decision.reason
          : `${decision.reason} (${section.academicGroup.class.name} · ${section.academicGroup.program.name} · Section ${section.name})`,
        { subjectId: [decision.reason] },
      )
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { sectionId: section.id, subjectId, staffId: proposed.staffId },
      select: { staffId: true, sectionId: true, subjectId: true, isActive: true },
    })
    const teacher = decideTeacherAllowed(assignments, {
      staffId: proposed.staffId,
      sectionId: section.id,
      subjectId,
    })
    if (!teacher.allowed) {
      throw new ConflictError(
        sections.length === 1
          ? teacher.reason
          : `${teacher.reason} (${section.academicGroup.class.name} · ${section.academicGroup.program.name} · Section ${section.name})`,
        { staffId: [teacher.reason] },
      )
    }
  }

  const occupants = await loadCellOccupants(
    proposed.academicSessionId,
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

  const sections = await loadSections(input.sectionIds)

  // Every section must be in the same year, or the lesson belongs to no one
  // year at all. The session is taken from them, never from the request.
  const academicSessionId = sections[0]!.academicSessionId
  if (sections.some((section) => section.academicSessionId !== academicSessionId)) {
    throw new ValidationError('Those sections are not all in the same academic session.', {
      sectionIds: ['A lesson cannot cover sections from different years.'],
    })
  }

  // A session may be sent, but only so it can be checked. If the caller thinks
  // these sections are in a different year from the one the database records,
  // that is a mistake worth showing rather than silently overruling.
  if (input.academicSessionId && input.academicSessionId !== academicSessionId) {
    throw new ValidationError('Those sections do not belong to that academic session.', {
      academicSessionId: ['Those sections do not belong to that academic session.'],
    })
  }

  const proposed: ProposedSlot = {
    academicSessionId,
    sectionIds: sections.map((section) => section.id),
    subjectId: input.subjectId,
    staffId: input.staffId,
    room: input.room ?? null,
    dayOfWeek: input.dayOfWeek,
    period: input.period,
  }
  await assertLessonIsAllowed(sections, proposed, input.subjectId)

  const created = await withUniqueConstraintHandling(
    () =>
      prisma.timetableSlot.create({
        data: {
          academicSessionId,
          subjectId: input.subjectId,
          staffId: input.staffId,
          dayOfWeek: input.dayOfWeek,
          period: input.period,
          room: input.room ?? null,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
          // The day, period and subject are copied onto each one: they are the
          // lesson's facts, kept here so the "same subject twice" rule can be
          // an index rather than a hope.
          sections: {
            create: sections.map((section) => ({
              sectionId: section.id,
              academicSessionId: section.academicSessionId,
              subjectId: input.subjectId,
              dayOfWeek: input.dayOfWeek,
              period: input.period,
            })),
          },
        },
        include: SLOT_INCLUDE,
      }),
    CLASH_MESSAGES,
    CLASH_FALLBACK,
  )

  const row = toSlotRow(created, await getCollegePeriods())
  const where = sections.map((section) => section.name).join(', ')
  await writeAuditLog(ctx, {
    action: 'timetable_slot.created',
    entityType: 'timetable_slot',
    entityId: created.id,
    entityLabel: `${row.subjectName} · ${where} · ${row.dayOfWeek} period ${row.period}`,
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

  const sections = await loadSections(input.sectionIds)
  const academicSessionId = sections[0]!.academicSessionId
  if (sections.some((section) => section.academicSessionId !== academicSessionId)) {
    throw new ValidationError('Those sections are not all in the same academic session.', {
      sectionIds: ['A lesson cannot cover sections from different years.'],
    })
  }
  if (academicSessionId !== existing.academicSessionId) {
    throw new ValidationError('A lesson cannot be moved to a different academic session.', {
      sectionIds: ['Those sections are in a different year from this lesson.'],
    })
  }

  const proposed: ProposedSlot = {
    id: existing.id,
    academicSessionId,
    sectionIds: sections.map((section) => section.id),
    subjectId: input.subjectId,
    staffId: input.staffId,
    room: input.room ?? null,
    dayOfWeek: existing.dayOfWeek as DayOfWeekValue,
    period: existing.period,
  }
  await assertLessonIsAllowed(sections, proposed, input.subjectId)

  const periods = await getCollegePeriods()
  const before = toSlotRow(existing, periods)
  // Wrapped for the same reason a create is: moving a teacher or a room into a
  // cell another administrator is filling at that moment is the same race.
  //
  // The section rows are written out and put back rather than patched: they
  // carry the lesson's subject, day and period, and rewriting them from what
  // the lesson now says is the thing that keeps them from ever disagreeing
  // with it.
  const updated = await withUniqueConstraintHandling(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.timetableSlotSection.deleteMany({ where: { slotId } })
        return tx.timetableSlot.update({
          where: { id: slotId },
          data: {
            subjectId: input.subjectId,
            staffId: input.staffId,
            room: input.room ?? null,
            updatedByUserId: ctx.userId,
            sections: {
              create: sections.map((section) => ({
                sectionId: section.id,
                academicSessionId: section.academicSessionId,
                subjectId: input.subjectId,
                dayOfWeek: existing.dayOfWeek,
                period: existing.period,
              })),
            },
          },
          include: SLOT_INCLUDE,
        })
      }),
    CLASH_MESSAGES,
    CLASH_FALLBACK,
  )

  const after = toSlotRow(updated, periods)

  // Only the fields that actually moved. An audit trail that records a change
  // where nothing changed teaches the reader to ignore it.
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of ['subjectName', 'staffName', 'room'] as const) {
    if (before[field] !== after[field]) changed[field] = { from: before[field], to: after[field] }
  }

  if (Object.keys(changed).length > 0) {
    await writeAuditLog(ctx, {
      action: 'timetable_slot.updated',
      entityType: 'timetable_slot',
      entityId: slotId,
      entityLabel: `${after.subjectName} · ${sections.map((x) => x.name).join(', ')} · ${after.dayOfWeek} period ${after.period}`,
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
/** What one copy of a day did, day by day. */
export interface CopyDayResult {
  /** Lessons written, across every target day. */
  copied: number
  /** Lessons removed to make room, when the office asked to replace. */
  cleared: number
  /** A line for each lesson that could not be copied, and why. */
  skipped: string[]
  /** Target days that already had lessons and were left alone. */
  occupied: DayOfWeekValue[]
}

/**
 * Copies one day of a section's week onto other days.
 *
 * A college week repeats — Monday, Wednesday and Friday are often the same day
 * three times — and typing it out three times is a chore and three chances to
 * get it wrong.
 *
 * Three things worth knowing about what this does:
 *
 *   - **A lesson shared with other sections is copied whole.** It is one
 *     lesson covering several sections, so the copy covers them too. Copying
 *     Monday for 1st Year Girls Bio also gives Wednesday to whoever sits with
 *     them, because that is what the lesson says.
 *   - **Every copy is checked like any other lesson.** The teacher may already
 *     be busy on Wednesday, or the room taken. Those are reported by name and
 *     the rest of the day is still copied — a half-copied day the office can
 *     see is better than a refusal it has to unpick.
 *   - **A day with lessons in it is left alone** unless the office asked to
 *     replace it. Quietly discarding somebody's afternoon would be worse than
 *     making them press the button twice.
 */
export async function copyTimetableDay(ctx: AuthContext, input: TimetableCopyDayInput): Promise<CopyDayResult> {
  requireTimetableAdmin(ctx, 'timetable.manage')

  const section = await loadSection(input.sectionId)
  const result: CopyDayResult = { copied: 0, cleared: 0, skipped: [], occupied: [] }

  const source = await prisma.timetableSlot.findMany({
    where: {
      academicSessionId: section.academicSessionId,
      dayOfWeek: input.fromDay,
      isActive: true,
      sections: { some: { sectionId: section.id, isActive: true } },
    },
    include: SLOT_INCLUDE,
    orderBy: { period: 'asc' },
  })

  if (source.length === 0) {
    throw new ConflictError(`There is nothing on ${DAY_LABEL[input.fromDay]} to copy.`, {
      fromDay: ['This day has no lessons in it.'],
    })
  }

  const periods = await getCollegePeriods()

  for (const day of input.toDays) {
    const existing = await prisma.timetableSlot.findMany({
      where: {
        academicSessionId: section.academicSessionId,
        dayOfWeek: day,
        isActive: true,
        sections: { some: { sectionId: section.id, isActive: true } },
      },
      select: { id: true },
    })

    if (existing.length > 0 && !input.replace) {
      result.occupied.push(day)
      continue
    }

    // Cleared the same way a lesson is removed by hand: the slot and its
    // section rows together, or the dead rows go on holding the cell.
    if (existing.length > 0) {
      const ids = existing.map((slot) => slot.id)
      await prisma.$transaction([
        prisma.timetableSlotSection.updateMany({ where: { slotId: { in: ids } }, data: { isActive: false } }),
        prisma.timetableSlot.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false, updatedByUserId: ctx.userId },
        }),
      ])
      result.cleared += ids.length
    }

    for (const lesson of source) {
      const sectionIds = lesson.sections.map((row) => row.sectionId)
      const sections = await loadSections(sectionIds)

      const proposed: ProposedSlot = {
        academicSessionId: lesson.academicSessionId,
        sectionIds,
        subjectId: lesson.subjectId,
        staffId: lesson.staffId,
        room: lesson.room,
        dayOfWeek: day,
        period: lesson.period,
      }

      try {
        await assertLessonIsAllowed(sections, proposed, lesson.subjectId)
      } catch (error) {
        const why = error instanceof Error ? error.message : 'it could not be placed'
        result.skipped.push(
          `${DAY_LABEL[day]}, period ${lesson.period}: ${lesson.subject.name} with ${lesson.staff.fullName} — ${why}`,
        )
        continue
      }

      await prisma.timetableSlot.create({
        data: {
          academicSessionId: lesson.academicSessionId,
          subjectId: lesson.subjectId,
          staffId: lesson.staffId,
          dayOfWeek: day,
          period: lesson.period,
          room: lesson.room,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
          sections: {
            create: sections.map((each) => ({
              sectionId: each.id,
              academicSessionId: each.academicSessionId,
              subjectId: lesson.subjectId,
              dayOfWeek: day,
              period: lesson.period,
            })),
          },
        },
      })
      result.copied += 1
    }
  }

  if (result.copied > 0 || result.cleared > 0) {
    await writeAuditLog(ctx, {
      action: 'timetable_day.copied',
      entityType: 'timetable_slot',
      entityLabel: `${toSectionSummary(section).sectionName} · ${DAY_LABEL[input.fromDay]} → ${input.toDays.map((day) => DAY_LABEL[day]).join(', ')}`,
      metadata: {
        fromDay: input.fromDay,
        toDays: input.toDays,
        copied: result.copied,
        cleared: result.cleared,
        skipped: result.skipped.length,
        periods: periods.length,
      },
    })
  }

  return result
}

export async function deactivateTimetableSlot(ctx: AuthContext, slotId: string): Promise<void> {
  requireTimetableAdmin(ctx, 'timetable.manage')

  const existing = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
    include: SLOT_INCLUDE,
  })
  if (!existing || !existing.isActive) throw new NotFoundError('That lesson does not exist.')

  // The section rows go inactive with it, in one transaction.
  //
  // They carry the partial unique index that keeps a section from taking the
  // same subject twice in a period, and that index only looks at active rows.
  // Leaving them behind would let a lesson nobody teaches any more hold its
  // cell for ever — which is precisely what the index was made partial to
  // avoid.
  await prisma.$transaction([
    prisma.timetableSlotSection.updateMany({ where: { slotId }, data: { isActive: false } }),
    prisma.timetableSlot.update({
      where: { id: slotId },
      data: { isActive: false, updatedByUserId: ctx.userId },
    }),
  ])

  await writeAuditLog(ctx, {
    action: 'timetable_slot.deactivated',
    entityType: 'timetable_slot',
    entityId: slotId,
    entityLabel: `${existing.subject.name} · ${existing.dayOfWeek} period ${existing.period}`,
    before: toSlotRow(existing, await getCollegePeriods()),
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
  sections: {
    where: { isActive: true },
    include: {
      section: {
        include: { academicGroup: { include: { class: true, division: true, program: true } } },
      },
    },
  },
} as const

function toTeacherLesson(slot: {
  id: string
  dayOfWeek: string
  period: number
  room: string | null
  subject: { id: string; name: string }
  sections: {
    section: {
      id: string
      name: string
      academicGroup: { class: { name: string }; division: { name: string }; program: { name: string } }
    }
  }[]
}, periods: readonly CollegePeriod[]): TeacherLesson {
  const period = periodOf(periods, slot.period)
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek as DayOfWeekValue,
    period: slot.period,
    startTime: period?.start ?? '',
    endTime: period?.end ?? '',
    subjectId: slot.subject.id,
    subjectName: slot.subject.name,
    sections: slot.sections.map(({ section }) => ({
      sectionId: section.id,
      sectionName: section.name,
      className: section.academicGroup.class.name,
      divisionName: section.academicGroup.division.name,
      programName: section.academicGroup.program.name,
    })),
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
  if (!session) return { sessionName: null, periods: await getCollegePeriods(), lessons: [] }

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

  const periods = await getCollegePeriods()
  return {
    sessionName: session.name,
    periods,
    lessons: slots.map((slot) => toTeacherLesson(slot, periods)),
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

  const periods = await getCollegePeriods()
  return { date, dayOfWeek, lessons: slots.map((slot) => toTeacherLesson(slot, periods)) }
}

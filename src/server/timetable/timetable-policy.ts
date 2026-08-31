/**
 * The timetable rules, as pure functions.
 *
 * Nothing here touches the database or the request. The service does the
 * lookups — what else is already in this period, what is on this section's
 * curriculum, which assignments this teacher actually holds — and these
 * functions decide. Same shape as `exams/exam-policy.ts` and
 * `attendance/access.ts` (ADR-071): every rule below has a test proving both
 * the case it allows and the case it refuses, rather than a comment claiming it.
 *
 * Three of the rules are clashes. Only one of them can be an index in the
 * database: a section can be constrained by a unique index because every one of
 * its lessons is a row about that section. A teacher and a room, though, are
 * shared across sections, so their clashes can only be found by looking at the
 * rest of the session — which is why they live here and are checked before a
 * write, not enforced afterwards by PostgreSQL.
 */
import type { DayOfWeek } from '@/generated/prisma/enums'
import { findPeriod } from './periods'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** The parts of a saved lesson these rules care about. A fuller row satisfies it. */
export interface TimetableSlotFacts {
  id: string
  academicSessionId: string
  sectionId: string
  staffId: string
  /** Free text, or null when the college has not said where the lesson is. */
  room: string | null
  dayOfWeek: DayOfWeek
  period: number
  isActive: boolean
}

/** A lesson somebody is trying to save. */
export interface ProposedSlot {
  /** Set when editing, so a lesson is never found to clash with itself. */
  id?: string
  academicSessionId: string
  sectionId: string
  staffId: string
  room?: string | null
  dayOfWeek: DayOfWeek
  period: number
}

export type ClashKind = 'SECTION' | 'TEACHER' | 'ROOM'

export interface TimetableClash {
  kind: ClashKind
  /** The lesson already in the way. */
  slotId: string
  reason: string
}

/* -------------------------------------------------------------------------- */
/* When two lessons meet                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Whether two lessons occupy the same cell of the week.
 *
 * Every clash starts here: same session, same day, same period. Two lessons in
 * different sessions never clash, however identical the rest of them looks —
 * next year's timetable is not a conflict with this year's.
 */
function sameCell(a: ProposedSlot, b: TimetableSlotFacts): boolean {
  return (
    a.academicSessionId === b.academicSessionId &&
    a.dayOfWeek === b.dayOfWeek &&
    a.period === b.period
  )
}

/**
 * A room name reduced to what makes two of them the same place.
 *
 * Rooms are free text — the college has no room table — so `Lab 1`, `lab 1` and
 * ` Lab 1 ` are one room and must clash with each other. A room that is null,
 * empty or only spaces is not a place at all and clashes with nothing: it means
 * the college has not said where the lesson is, and refusing to save a lesson
 * for that reason would be wrong.
 */
function roomKey(room: string | null | undefined): string | null {
  const trimmed = (room ?? '').trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/** Lessons that could actually be in the way: active, and not the one being saved. */
function contenders(
  proposed: ProposedSlot,
  existing: readonly TimetableSlotFacts[],
): TimetableSlotFacts[] {
  return existing.filter((slot) => slot.isActive && slot.id !== proposed.id)
}

/* -------------------------------------------------------------------------- */
/* A. Section clash                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The section is already doing something else in this period.
 *
 * The database enforces this too, through a unique index over
 * `(section, session, day, period)` that applies to ACTIVE rows only. It is
 * repeated here so the admin gets a sentence rather than a constraint
 * violation — and so the reason can name the lesson that is in the way.
 */
export function findSectionClash(
  proposed: ProposedSlot,
  existing: readonly TimetableSlotFacts[],
): TimetableClash | null {
  const clash = contenders(proposed, existing).find(
    (slot) => sameCell(proposed, slot) && slot.sectionId === proposed.sectionId,
  )
  return clash
    ? {
        kind: 'SECTION',
        slotId: clash.id,
        reason: 'This section already has a lesson in this period.',
      }
    : null
}

/* -------------------------------------------------------------------------- */
/* B. Teacher clash                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The teacher is already teaching another section in this period.
 *
 * The database refuses this too, through a partial unique index over
 * `(staff, session, day, period)` on active rows — this check exists so the
 * admin gets a sentence, and so the reason can name the lesson in the way.
 */
export function findTeacherClash(
  proposed: ProposedSlot,
  existing: readonly TimetableSlotFacts[],
): TimetableClash | null {
  const clash = contenders(proposed, existing).find(
    (slot) => sameCell(proposed, slot) && slot.staffId === proposed.staffId,
  )
  return clash
    ? {
        kind: 'TEACHER',
        slotId: clash.id,
        reason: 'This teacher is already taking another lesson in this period.',
      }
    : null
}

/* -------------------------------------------------------------------------- */
/* C. Room clash                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The room is already in use in this period. A lesson with no room is fine.
 *
 * Backed by a functional partial unique index over `lower(btrim(room))`, which
 * applies exactly the normalisation `roomKey` does below — so what this refuses
 * and what the database refuses are the same set.
 */
export function findRoomClash(
  proposed: ProposedSlot,
  existing: readonly TimetableSlotFacts[],
): TimetableClash | null {
  const wanted = roomKey(proposed.room)
  if (wanted === null) return null

  const clash = contenders(proposed, existing).find(
    (slot) => sameCell(proposed, slot) && roomKey(slot.room) === wanted,
  )
  return clash
    ? { kind: 'ROOM', slotId: clash.id, reason: 'This room is already in use in this period.' }
    : null
}

/**
 * Every way this lesson conflicts with the timetable it is being saved into.
 *
 * All three are reported rather than the first one found: an admin who has put
 * the wrong teacher *and* the wrong room in a cell should be told both at once,
 * not sent round the loop twice.
 */
export function findTimetableClashes(
  proposed: ProposedSlot,
  existing: readonly TimetableSlotFacts[],
): TimetableClash[] {
  return [
    findSectionClash(proposed, existing),
    findTeacherClash(proposed, existing),
    findRoomClash(proposed, existing),
  ].filter((clash): clash is TimetableClash => clash !== null)
}

/* -------------------------------------------------------------------------- */
/* What a lesson may be made of                                               */
/* -------------------------------------------------------------------------- */

export type TimetableDecision =
  | { allowed: true }
  | { allowed: false; code: TimetableRefusal; reason: string }

export type TimetableRefusal =
  | 'NOT_A_PERIOD'
  | 'BREAK_PERIOD'
  | 'UNKNOWN_CURRICULUM'
  | 'SUBJECT_NOT_IN_CURRICULUM'
  | 'TEACHER_NOT_ASSIGNED'

/** What a section is taught, derived by the service from its class and programme. */
export interface SectionCurriculum {
  /** Subject ids on this section's curriculum for the session. */
  subjectIds: readonly string[]
}

/** The parts of a `TeacherAssignment` these rules care about. */
export interface TeacherAssignmentFacts {
  staffId: string
  sectionId: string
  subjectId: string
  isActive: boolean
}

/* -------------------------------------------------------------------------- */
/* Period eligibility                                                         */
/* -------------------------------------------------------------------------- */

/**
 * May a lesson be put in this period at all?
 *
 * Two ways it may not. The number might not be a period of the college day —
 * the grid is 1 to 9, and a request for period 12 is a mistake or a probe.
 * Or it might be the **break**, which is a period of the day but not a period
 * of teaching: the college stops at 11:10 and starts again at 11:40, and the
 * timetable has to know that rather than the office remembering it.
 *
 * The break is refused here, in the rules, precisely so nobody is tempted to
 * hold the cell with a made-up subject and a made-up teacher.
 */
export function decidePeriodAllowed(period: number): TimetableDecision {
  const configured = findPeriod(period)

  if (configured === null) {
    return {
      allowed: false,
      code: 'NOT_A_PERIOD',
      reason: 'That is not a period of the college day.',
    }
  }

  if (configured.isBreak) {
    return {
      allowed: false,
      code: 'BREAK_PERIOD',
      reason: `Period ${configured.period} is the college break (${configured.start}–${configured.end}) and cannot be timetabled.`,
    }
  }

  return { allowed: true }
}

/* -------------------------------------------------------------------------- */
/* D. Subject eligibility                                                     */
/* -------------------------------------------------------------------------- */

/**
 * May this subject be timetabled for this section?
 *
 * Only if it is on the section's curriculum. Scheduling a subject a section
 * does not study would put a lesson on their week, a register in their history
 * and a row on their result card for a course they are not taking (ADR-063).
 *
 * A null curriculum means the service could not find one — an unknown or
 * unbuilt section — and that is a refusal, not an empty pass.
 */
export function decideSubjectAllowed(
  curriculum: SectionCurriculum | null,
  subjectId: string,
): TimetableDecision {
  if (curriculum === null) {
    return {
      allowed: false,
      code: 'UNKNOWN_CURRICULUM',
      reason: 'This section has no curriculum for the session yet.',
    }
  }

  if (!curriculum.subjectIds.includes(subjectId)) {
    return {
      allowed: false,
      code: 'SUBJECT_NOT_IN_CURRICULUM',
      reason: 'This subject is not on the section’s curriculum.',
    }
  }

  return { allowed: true }
}

/* -------------------------------------------------------------------------- */
/* E. Teacher assignment eligibility                                          */
/* -------------------------------------------------------------------------- */

/**
 * May this teacher take this subject in this section?
 *
 * Only with an ACTIVE `TeacherAssignment` for that exact section *and* subject.
 * This is the same authority attendance and marks already answer to — there is
 * one teacher-subject authorization in this project, not one per module
 * (ADR-008) — and it is what stops the Biology teacher being timetabled for
 * Chemistry in a section they already teach.
 *
 * A closed assignment is not a weaker one. It is history, and it grants nothing.
 */
export function decideTeacherAllowed(
  assignments: readonly TeacherAssignmentFacts[],
  lesson: { staffId: string; sectionId: string; subjectId: string },
): TimetableDecision {
  const assigned = assignments.some(
    (a) =>
      a.isActive &&
      a.staffId === lesson.staffId &&
      a.sectionId === lesson.sectionId &&
      a.subjectId === lesson.subjectId,
  )

  return assigned
    ? { allowed: true }
    : {
        allowed: false,
        code: 'TEACHER_NOT_ASSIGNED',
        reason: 'This teacher is not assigned to this subject in this section.',
      }
}

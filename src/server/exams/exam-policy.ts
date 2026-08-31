/**
 * The exam scheduling rules, as pure functions.
 *
 * Nothing here touches the database or the request. That is deliberate: these
 * are the rules a college argues about — which subject may be set as a paper,
 * what counts as a clash, when a date sheet is fit to publish — and rules like
 * that need to be readable in one place and testable without a database.
 *
 * The service does the lookups and calls these; the routes call the service.
 * Same shape as attendance-policy.ts in Phase 7.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** What a class offers in one session: its programmes and their curricula. */
export interface ClassCurriculum {
  /** Programme ids that run this class in the session. */
  programIds: string[]
  /** Subject ids taught, keyed by programme id. */
  subjectsByProgram: Record<string, string[]>
}

/** The parts of a paper these rules care about. A fuller row satisfies it. */
export interface ScheduledPaper {
  id: string
  classId: string
  className: string
  programId: string | null
  programName: string | null
  subjectId: string
  subjectName: string
  examDate: string | null
  startTime: string | null
  endTime: string | null
  room: string | null
  maxMarks: string
}

export interface ProposedPaper {
  classId: string
  subjectId: string
  programId?: string | null
  examDate?: string | null
  startTime?: string | null
  endTime?: string | null
}

/* -------------------------------------------------------------------------- */
/* Overlap                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether two papers could ever be sat by the same student.
 *
 * A null programme means "every programme in the class", so it overlaps with
 * anything else in that class — including another null.
 */
export function scopesOverlap(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b
}

/**
 * Whether two `HH:MM` ranges overlap.
 *
 * A paper with no start time clashes with nothing: it is not scheduled yet, and
 * refusing to save it would stop an admin entering the subjects first and the
 * timetable afterwards. A paper with a start but no end is treated as an instant,
 * so two papers starting at the same moment still clash.
 */
export function timesOverlap(
  a: { start: string | null; end: string | null },
  b: { start: string | null; end: string | null },
): boolean {
  if (!a.start || !b.start) return false
  const aEnd = a.end ?? a.start
  const bEnd = b.end ?? b.start
  if (a.start === b.start) return true
  return a.start < bEnd && b.start < aEnd
}

/* -------------------------------------------------------------------------- */
/* What a paper may be made of                                                */
/* -------------------------------------------------------------------------- */

export type ScopeVerdict =
  | { ok: true }
  | { ok: false; field: 'classId' | 'programId' | 'subjectId'; message: string }

/**
 * Whether a proposed paper's class, programme and subject belong together.
 *
 * A paper for one programme needs the subject on that programme's curriculum. A
 * paper for the whole class needs it on **every** programme's curriculum —
 * otherwise some of its students would be sitting a paper that is not on their
 * course at all.
 */
export function checkPaperScope(
  available: ClassCurriculum | null,
  input: { programId?: string | null; subjectId: string },
): ScopeVerdict {
  if (!available || available.programIds.length === 0) {
    return {
      ok: false,
      field: 'classId',
      message: 'That class is not part of this exam’s academic session.',
    }
  }

  const programId = input.programId ?? null

  if (programId !== null && !available.programIds.includes(programId)) {
    return {
      ok: false,
      field: 'programId',
      message: 'That programme does not run in this class this session.',
    }
  }

  const programIds = programId === null ? available.programIds : [programId]
  const taughtIn = programIds.filter((id) =>
    (available.subjectsByProgram[id] ?? []).includes(input.subjectId),
  )

  if (taughtIn.length === programIds.length) return { ok: true }

  return {
    ok: false,
    field: 'subjectId',
    message:
      programId === null
        ? 'That subject is not studied by every programme in this class, so it cannot be set as one paper for the whole class. Add a paper per programme instead.'
        : 'That subject is not in this class and programme’s curriculum.',
  }
}

/* -------------------------------------------------------------------------- */
/* Clashes                                                                    */
/* -------------------------------------------------------------------------- */

export interface PaperConflict {
  kind: 'duplicate-subject' | 'time-clash'
  field: 'subjectId' | 'startTime'
  message: string
}

/**
 * The first reason a proposed paper could not be sat, or null.
 *
 * Two kinds of impossibility are caught: the same subject offered twice to the
 * same students, and two papers at overlapping times on the same day. This is
 * not a timetable engine — it only rejects what is plainly impossible.
 */
export function findPaperConflict(
  siblings: readonly ScheduledPaper[],
  input: ProposedPaper,
): PaperConflict | null {
  const programId = input.programId ?? null

  for (const other of siblings) {
    if (other.classId !== input.classId) continue
    if (!scopesOverlap(programId, other.programId)) continue

    if (other.subjectId === input.subjectId) {
      return {
        kind: 'duplicate-subject',
        field: 'subjectId',
        message:
          other.programId === null || programId === null
            ? `There is already a ${other.subjectName} paper covering these students. A paper for the whole class and a paper for one programme would give the same student two marks for the subject.`
            : `There is already a ${other.subjectName} paper for this class and programme.`,
      }
    }

    if (!input.examDate || other.examDate !== input.examDate) continue

    if (
      timesOverlap(
        { start: input.startTime ?? null, end: input.endTime ?? null },
        { start: other.startTime, end: other.endTime },
      )
    ) {
      return {
        kind: 'time-clash',
        field: 'startTime',
        message: `This clashes with ${other.subjectName}${
          other.programName ? ` (${other.programName})` : ''
        } at ${other.startTime}. The same students cannot sit two papers at once.`,
      }
    }
  }

  return null
}

/** Whether a paper's date falls inside the exam's own dates, when it has any. */
export function isDateWithinExam(
  exam: { startDate: string | null; endDate: string | null },
  examDate?: string | null,
): boolean {
  if (!examDate) return true
  if (exam.startDate && examDate < exam.startDate) return false
  if (exam.endDate && examDate > exam.endDate) return false
  return true
}

/* -------------------------------------------------------------------------- */
/* Is the date sheet fit to publish?                                          */
/* -------------------------------------------------------------------------- */

export interface DateSheetProblem {
  paperId: string | null
  message: string
}

/**
 * Everything wrong with a date sheet, in one pass.
 *
 * Returned as a list rather than thrown one at a time, so an admin fixes the
 * whole schedule in one go instead of discovering each fault on a fresh attempt.
 *
 * Clashes are re-checked here as well as on save: a paper saved before its
 * neighbour existed, or edited in another tab, could still leave two papers on
 * top of each other.
 */
export function findDateSheetProblems(papers: readonly ScheduledPaper[]): DateSheetProblem[] {
  const problems: DateSheetProblem[] = []

  if (papers.length === 0) {
    return [{ paperId: null, message: 'The exam has no papers yet. Add at least one.' }]
  }

  for (const paper of papers) {
    const label = `${paper.subjectName} (${paper.className}${
      paper.programName ? ` · ${paper.programName}` : ' · all programmes'
    })`

    if (!paper.examDate) {
      problems.push({ paperId: paper.id, message: `${label} has no date.` })
    }
    if (!paper.startTime) {
      problems.push({ paperId: paper.id, message: `${label} has no start time.` })
    }
    if (paper.startTime && paper.endTime && paper.endTime <= paper.startTime) {
      problems.push({ paperId: paper.id, message: `${label} ends before it starts.` })
    }
  }

  for (let i = 0; i < papers.length; i += 1) {
    for (let j = i + 1; j < papers.length; j += 1) {
      const a = papers[i]!
      const b = papers[j]!
      if (a.classId !== b.classId) continue
      if (!scopesOverlap(a.programId, b.programId)) continue
      if (!a.examDate || a.examDate !== b.examDate) continue
      if (
        timesOverlap(
          { start: a.startTime, end: a.endTime },
          { start: b.startTime, end: b.endTime },
        )
      ) {
        problems.push({
          paperId: b.id,
          message: `${a.subjectName} and ${b.subjectName} overlap on ${a.examDate} for ${a.className}.`,
        })
      }
    }
  }

  return problems
}

/* -------------------------------------------------------------------------- */
/* The date sheet, arranged for reading                                       */
/* -------------------------------------------------------------------------- */

export interface DateSheetEntry {
  paperId: string
  examDate: string | null
  startTime: string | null
  endTime: string | null
  subjectName: string
  room: string | null
  maxMarks: string
}

export interface DateSheetGroup {
  classId: string
  className: string
  programId: string | null
  programName: string
  entries: DateSheetEntry[]
}

/**
 * Groups papers the way a date sheet is read: one schedule per class and
 * programme, in date order.
 *
 * A paper with no programme is sat by everyone in the class, so it appears in
 * each programme's schedule — which is what a student looking up their own
 * timetable expects to see.
 *
 * Being a plain function over rows the service already fetched means the future
 * staff and student views can reuse it unchanged.
 */
export function buildDateSheet(papers: readonly ScheduledPaper[]): DateSheetGroup[] {
  const groups = new Map<string, DateSheetGroup>()

  const programsPerClass = new Map<string, Map<string, string>>()
  for (const paper of papers) {
    if (!paper.programId || !paper.programName) continue
    const seen = programsPerClass.get(paper.classId) ?? new Map<string, string>()
    seen.set(paper.programId, paper.programName)
    programsPerClass.set(paper.classId, seen)
  }

  const add = (paper: ScheduledPaper, programId: string | null, programName: string) => {
    const key = `${paper.classId}:${programId ?? 'ALL'}`
    let group = groups.get(key)
    if (!group) {
      group = {
        classId: paper.classId,
        className: paper.className,
        programId,
        programName,
        entries: [],
      }
      groups.set(key, group)
    }
    group.entries.push({
      paperId: paper.id,
      examDate: paper.examDate,
      startTime: paper.startTime,
      endTime: paper.endTime,
      subjectName: paper.subjectName,
      room: paper.room,
      maxMarks: paper.maxMarks,
    })
  }

  for (const paper of papers) {
    if (paper.programId && paper.programName) {
      add(paper, paper.programId, paper.programName)
      continue
    }

    // Shared paper: show it in every programme of the class that has one of its
    // own. If none has, the class gets a single combined schedule.
    const programs = programsPerClass.get(paper.classId)
    if (programs && programs.size > 0) {
      for (const [programId, programName] of programs) add(paper, programId, programName)
    } else {
      add(paper, null, 'All programmes')
    }
  }

  const sortKey = (entry: DateSheetEntry) =>
    `${entry.examDate ?? '9999-99-99'} ${entry.startTime ?? '99:99'}`

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    }))
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className) || a.programName.localeCompare(b.programName),
    )
}

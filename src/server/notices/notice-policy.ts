/**
 * Who sees a notice, and when -- as pure functions.
 *
 * Nothing here touches the database or the request. The service looks up the
 * facts -- a student's current section, group, class, division and programme;
 * a teacher's assigned sections and what they roll up to; a notice's targets
 * and its publish window -- and these functions decide. Same shape as
 * `attendance/access.ts` and `timetable/timetable-policy.ts` (ADR-071): every
 * rule has a test proving both the case it allows and the case it refuses.
 *
 * The audience model is the college's own. A notice is *for* one or more
 * targets: everybody, all students, all staff, or one part of the academic
 * structure -- a class, a division, a programme, a group (class × division ×
 * programme) or a section. A reader sees a notice when any one of its targets
 * reaches them.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** Mirrors the `Audience` enum. Kept local so this module needs no generated code. */
export const AUDIENCES = [
  'ALL',
  'STUDENTS',
  'STAFF',
  'CLASS',
  'DIVISION',
  'PROGRAM',
  'GROUP',
  'SECTION',
] as const
export type Audience = (typeof AUDIENCES)[number]

/** The three audiences that name a whole population rather than a part of the structure. */
export const POPULATION_AUDIENCES = ['ALL', 'STUDENTS', 'STAFF'] as const
export type PopulationAudience = (typeof POPULATION_AUDIENCES)[number]

export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED'

/** One target of a notice. A fuller row satisfies it. */
export interface NoticeTargetFacts {
  audience: Audience
  classId?: string | null
  divisionId?: string | null
  programId?: string | null
  academicGroupId?: string | null
  sectionId?: string | null
}

/** Where a student is right now: their current enrollment, resolved upwards. */
export interface StudentPlacement {
  sectionId: string
  academicGroupId: string
  classId: string
  divisionId: string
  programId: string
}

/**
 * What a teacher's active assignments and in-charge roles reach: the sections
 * they teach, and everything those sections belong to. "Notices for assigned
 * classes only" is this.
 */
export interface StaffScope {
  sectionIds: readonly string[]
  academicGroupIds: readonly string[]
  classIds: readonly string[]
  divisionIds: readonly string[]
  programIds: readonly string[]
}

export type NoticeViewer =
  | { role: 'ADMIN' }
  | { role: 'STAFF'; scope: StaffScope | null }
  | { role: 'STUDENT'; placement: StudentPlacement | null }

/* -------------------------------------------------------------------------- */
/* What a target may be made of                                               */
/* -------------------------------------------------------------------------- */

const ID_FIELDS = ['classId', 'divisionId', 'programId', 'academicGroupId', 'sectionId'] as const
type IdField = (typeof ID_FIELDS)[number]

/** Which id column each structural audience requires. */
const REQUIRED_ID: Record<Exclude<Audience, PopulationAudience>, IdField> = {
  CLASS: 'classId',
  DIVISION: 'divisionId',
  PROGRAM: 'programId',
  GROUP: 'academicGroupId',
  SECTION: 'sectionId',
}

export type TargetVerdict = { ok: true } | { ok: false; field: IdField | 'audience'; message: string }

function isPopulation(audience: Audience): audience is PopulationAudience {
  return (POPULATION_AUDIENCES as readonly string[]).includes(audience)
}

function setIdFields(target: NoticeTargetFacts): IdField[] {
  return ID_FIELDS.filter((f) => target[f] !== undefined && target[f] !== null && target[f] !== '')
}

/**
 * Whether a target names exactly what its audience needs, and nothing else.
 *
 * `ALL`, `STUDENTS` and `STAFF` carry no id. Each structural audience carries
 * exactly its own id -- a `CLASS` target with a section on it is not a more
 * specific class target, it is a mistake, and the database refuses it too.
 */
export function checkTarget(target: NoticeTargetFacts): TargetVerdict {
  if (!(AUDIENCES as readonly string[]).includes(target.audience)) {
    return { ok: false, field: 'audience', message: 'Choose who this notice is for.' }
  }

  const set = setIdFields(target)

  if (isPopulation(target.audience)) {
    if (set.length > 0) {
      return {
        ok: false,
        field: set[0]!,
        message: `A notice for ${label(target.audience)} does not name a ${describe(set[0]!)}.`,
      }
    }
    return { ok: true }
  }

  const required = REQUIRED_ID[target.audience]
  if (!set.includes(required)) {
    return { ok: false, field: required, message: `Choose which ${describe(required)}.` }
  }
  const extra = set.find((f) => f !== required)
  if (extra) {
    return {
      ok: false,
      field: extra,
      message: `A ${describe(required)} target does not also name a ${describe(extra)}.`,
    }
  }
  return { ok: true }
}

function label(audience: PopulationAudience): string {
  return audience === 'ALL' ? 'everyone' : audience === 'STUDENTS' ? 'all students' : 'all staff'
}

function describe(field: IdField): string {
  return {
    classId: 'class',
    divisionId: 'division',
    programId: 'programme',
    academicGroupId: 'group',
    sectionId: 'section',
  }[field]
}

/**
 * A key that is the same for two targets that mean the same thing -- the
 * in-memory twin of the NULLS NOT DISTINCT unique index in the migration.
 */
export function targetKey(target: NoticeTargetFacts): string {
  return [target.audience, ...ID_FIELDS.map((f) => target[f] ?? '')].join('|')
}

/** The keys that appear more than once, so a form can say which rows repeat. */
export function findDuplicateTargets(targets: readonly NoticeTargetFacts[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const target of targets) {
    const key = targetKey(target)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return [...duplicates]
}

/* -------------------------------------------------------------------------- */
/* Who a target reaches                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whether one target reaches this reader.
 *
 * An administrator is reached by everything: they manage notices, and a notice
 * they could not see would be one they could not fix. A student is reached
 * through where they are enrolled; a teacher through where they teach. Someone
 * with no placement or no scope -- a student not enrolled this session, a
 * staff login with no assignments -- is reached only by `ALL` and their
 * population's audience.
 */
export function targetReaches(target: NoticeTargetFacts, viewer: NoticeViewer): boolean {
  if (viewer.role === 'ADMIN') return true
  if (target.audience === 'ALL') return true

  if (viewer.role === 'STUDENT') {
    if (target.audience === 'STUDENTS') return true
    if (target.audience === 'STAFF') return false
    const p = viewer.placement
    if (!p) return false
    switch (target.audience) {
      case 'CLASS':
        return p.classId === target.classId
      case 'DIVISION':
        return p.divisionId === target.divisionId
      case 'PROGRAM':
        return p.programId === target.programId
      case 'GROUP':
        return p.academicGroupId === target.academicGroupId
      case 'SECTION':
        return p.sectionId === target.sectionId
    }
  }

  // STAFF
  if (target.audience === 'STAFF') return true
  if (target.audience === 'STUDENTS') return false
  const s = viewer.scope
  if (!s) return false
  switch (target.audience) {
    case 'CLASS':
      return has(s.classIds, target.classId)
    case 'DIVISION':
      return has(s.divisionIds, target.divisionId)
    case 'PROGRAM':
      return has(s.programIds, target.programId)
    case 'GROUP':
      return has(s.academicGroupIds, target.academicGroupId)
    case 'SECTION':
      return has(s.sectionIds, target.sectionId)
  }
}

function has(ids: readonly string[], id: string | null | undefined): boolean {
  return id !== null && id !== undefined && ids.includes(id)
}

/**
 * Whether any of a notice's targets reaches this reader.
 *
 * A notice with no targets at all reaches nobody but the office. It is not
 * "for everyone" by accident -- the office says so by adding `ALL`.
 */
export function isTargeted(targets: readonly NoticeTargetFacts[], viewer: NoticeViewer): boolean {
  if (viewer.role === 'ADMIN') return true
  return targets.some((t) => targetReaches(t, viewer))
}

/* -------------------------------------------------------------------------- */
/* When a notice shows                                                        */
/* -------------------------------------------------------------------------- */

export interface PublishWindow {
  status: PublishStatus
  publishAt: Date | string
  expiresAt: Date | string | null
}

export type WindowClosedReason = 'DRAFT' | 'ARCHIVED' | 'NOT_YET' | 'EXPIRED'

export type WindowVerdict = { open: true } | { open: false; reason: WindowClosedReason }

const toMillis = (value: Date | string): number =>
  typeof value === 'string' ? new Date(value).getTime() : value.getTime()

/**
 * Whether a notice is showing at `now`.
 *
 * Published, `publishAt` reached (a notice published for 08:00 shows *at*
 * 08:00, not a millisecond later), and not yet at `expiresAt` (it is gone the
 * moment expiry arrives). Drafts and archived notices never show.
 */
export function checkPublishWindow(notice: PublishWindow, now: Date): WindowVerdict {
  if (notice.status === 'DRAFT') return { open: false, reason: 'DRAFT' }
  if (notice.status === 'ARCHIVED') return { open: false, reason: 'ARCHIVED' }
  const at = now.getTime()
  if (toMillis(notice.publishAt) > at) return { open: false, reason: 'NOT_YET' }
  if (notice.expiresAt !== null && toMillis(notice.expiresAt) <= at) {
    return { open: false, reason: 'EXPIRED' }
  }
  return { open: true }
}

export type NoticeHiddenReason = WindowClosedReason | 'NOT_TARGETED'

export type NoticeVisibility = { visible: true } | { visible: false; reason: NoticeHiddenReason }

/**
 * The one question the feeds ask: does this reader see this notice right now?
 *
 * The office sees every notice in every state -- that is what managing them
 * means. Everyone else needs the window to be open *and* a target to reach
 * them; the window is checked first so a draft is never reported as
 * "not for you".
 */
export function decideNoticeVisible(
  notice: PublishWindow & { targets: readonly NoticeTargetFacts[] },
  viewer: NoticeViewer,
  now: Date,
): NoticeVisibility {
  if (viewer.role === 'ADMIN') return { visible: true }

  const window = checkPublishWindow(notice, now)
  if (!window.open) return { visible: false, reason: window.reason }

  if (!isTargeted(notice.targets, viewer)) return { visible: false, reason: 'NOT_TARGETED' }
  return { visible: true }
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/** An event's audience is a whole population; the structure is for notices. */
export function isEventAudience(audience: Audience): audience is PopulationAudience {
  return isPopulation(audience)
}

export type EventVisibility =
  | { visible: true }
  | { visible: false; reason: 'DRAFT' | 'NOT_FOR_YOU' }

/**
 * Whether this reader sees this event.
 *
 * A cancelled event stays visible to its audience, marked cancelled -- the
 * point of cancelling is that people find out. A draft is the office's alone.
 */
export function decideEventVisible(
  event: { status: EventStatus; audience: PopulationAudience },
  role: 'ADMIN' | 'STAFF' | 'STUDENT',
): EventVisibility {
  if (role === 'ADMIN') return { visible: true }
  if (event.status === 'DRAFT') return { visible: false, reason: 'DRAFT' }
  if (event.audience === 'ALL') return { visible: true }
  if (event.audience === 'STUDENTS' && role === 'STUDENT') return { visible: true }
  if (event.audience === 'STAFF' && role === 'STAFF') return { visible: true }
  return { visible: false, reason: 'NOT_FOR_YOU' }
}

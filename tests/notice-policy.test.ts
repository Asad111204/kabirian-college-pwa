import { describe, expect, it } from 'vitest'
import {
  AUDIENCES,
  checkPublishWindow,
  checkTarget,
  decideEventVisible,
  decideNoticeVisible,
  findDuplicateTargets,
  isEventAudience,
  isTargeted,
  targetKey,
  targetReaches,
  type NoticeTargetFacts,
  type NoticeViewer,
  type StaffScope,
  type StudentPlacement,
} from '@/server/notices/notice-policy'

/**
 * Who sees a notice, and when.
 *
 * This is the security core of Phase 11: a notice reaching the wrong people is
 * the bug the whole audience model exists to prevent. Every rule is tested
 * from both sides -- the reader it must reach, and the neighbouring reader it
 * must not.
 */

const CLASS_1 = 'class-1st-year'
const CLASS_2 = 'class-2nd-year'
const DIV_BOYS = 'division-boys'
const DIV_GIRLS = 'division-girls'
const PROG_PM = 'program-pre-medical'
const PROG_ICS = 'program-ics'
const GROUP_A = 'group-1st-boys-pm'
const GROUP_B = 'group-2nd-girls-ics'
const SEC_A = 'section-a'
const SEC_B = 'section-b'

const placement = (over: Partial<StudentPlacement> = {}): StudentPlacement => ({
  sectionId: SEC_A,
  academicGroupId: GROUP_A,
  classId: CLASS_1,
  divisionId: DIV_BOYS,
  programId: PROG_PM,
  ...over,
})

const scope = (over: Partial<StaffScope> = {}): StaffScope => ({
  sectionIds: [SEC_A],
  academicGroupIds: [GROUP_A],
  classIds: [CLASS_1],
  divisionIds: [DIV_BOYS],
  programIds: [PROG_PM],
  ...over,
})

const student = (p: StudentPlacement | null = placement()): NoticeViewer => ({
  role: 'STUDENT',
  placement: p,
})
const teacher = (s: StaffScope | null = scope()): NoticeViewer => ({ role: 'STAFF', scope: s })
const admin: NoticeViewer = { role: 'ADMIN' }

const target = (
  audience: NoticeTargetFacts['audience'],
  ids: Partial<Omit<NoticeTargetFacts, 'audience'>> = {},
): NoticeTargetFacts => ({ audience, ...ids })

/* -------------------------------------------------------------------------- */
/* What a target may be made of                                               */
/* -------------------------------------------------------------------------- */

describe('a target names exactly what its audience needs', () => {
  it('lists the eight audiences the database knows', () => {
    expect([...AUDIENCES]).toEqual([
      'ALL',
      'STUDENTS',
      'STAFF',
      'CLASS',
      'DIVISION',
      'PROGRAM',
      'GROUP',
      'SECTION',
    ])
  })

  it('accepts the population audiences with no id', () => {
    for (const a of ['ALL', 'STUDENTS', 'STAFF'] as const) {
      expect(checkTarget(target(a))).toEqual({ ok: true })
    }
  })

  it('refuses a population audience that names a part of the structure', () => {
    const verdict = checkTarget(target('ALL', { sectionId: SEC_A }))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('sectionId')
  })

  it('accepts each structural audience with exactly its own id', () => {
    expect(checkTarget(target('CLASS', { classId: CLASS_1 }))).toEqual({ ok: true })
    expect(checkTarget(target('DIVISION', { divisionId: DIV_BOYS }))).toEqual({ ok: true })
    expect(checkTarget(target('PROGRAM', { programId: PROG_PM }))).toEqual({ ok: true })
    expect(checkTarget(target('GROUP', { academicGroupId: GROUP_A }))).toEqual({ ok: true })
    expect(checkTarget(target('SECTION', { sectionId: SEC_A }))).toEqual({ ok: true })
  })

  it('refuses a structural audience with its id missing', () => {
    const verdict = checkTarget(target('SECTION'))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.field).toBe('sectionId')
      expect(verdict.message).toMatch(/which section/i)
    }
  })

  it('refuses a structural audience carrying a second id', () => {
    const verdict = checkTarget(target('CLASS', { classId: CLASS_1, sectionId: SEC_A }))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('sectionId')
  })

  it('treats an empty string as no id, the way a form sends it', () => {
    expect(checkTarget(target('ALL', { classId: '' }))).toEqual({ ok: true })
    expect(checkTarget(target('CLASS', { classId: '' })).ok).toBe(false)
  })

  it('refuses an audience it has never heard of', () => {
    const verdict = checkTarget({ audience: 'PARENTS' as never })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe('audience')
  })
})

describe('the same target twice is a duplicate', () => {
  it('keys two identical targets the same and two different ones apart', () => {
    expect(targetKey(target('SECTION', { sectionId: SEC_A }))).toBe(
      targetKey(target('SECTION', { sectionId: SEC_A })),
    )
    expect(targetKey(target('SECTION', { sectionId: SEC_A }))).not.toBe(
      targetKey(target('SECTION', { sectionId: SEC_B })),
    )
    expect(targetKey(target('ALL'))).not.toBe(targetKey(target('STUDENTS')))
  })

  it('finds the repeated ones and leaves the rest alone', () => {
    const duplicates = findDuplicateTargets([
      target('ALL'),
      target('SECTION', { sectionId: SEC_A }),
      target('SECTION', { sectionId: SEC_A }),
      target('SECTION', { sectionId: SEC_B }),
    ])
    expect(duplicates).toEqual([targetKey(target('SECTION', { sectionId: SEC_A }))])
  })

  it('treats null and missing as the same absence', () => {
    expect(targetKey({ audience: 'ALL', classId: null })).toBe(targetKey({ audience: 'ALL' }))
  })
})

/* -------------------------------------------------------------------------- */
/* Who a target reaches                                                       */
/* -------------------------------------------------------------------------- */

describe('ALL reaches everyone', () => {
  it('reaches a student, a teacher and an admin', () => {
    expect(targetReaches(target('ALL'), student())).toBe(true)
    expect(targetReaches(target('ALL'), teacher())).toBe(true)
    expect(targetReaches(target('ALL'), admin)).toBe(true)
  })

  it('reaches a student with no enrollment and a teacher with no assignments', () => {
    expect(targetReaches(target('ALL'), student(null))).toBe(true)
    expect(targetReaches(target('ALL'), teacher(null))).toBe(true)
  })
})

describe('STUDENTS and STAFF reach their own population only', () => {
  it('STUDENTS reaches a student, not a teacher', () => {
    expect(targetReaches(target('STUDENTS'), student())).toBe(true)
    expect(targetReaches(target('STUDENTS'), teacher())).toBe(false)
  })

  it('STAFF reaches a teacher, not a student', () => {
    expect(targetReaches(target('STAFF'), teacher())).toBe(true)
    expect(targetReaches(target('STAFF'), student())).toBe(false)
  })

  it('reaches the population even with no placement or scope', () => {
    expect(targetReaches(target('STUDENTS'), student(null))).toBe(true)
    expect(targetReaches(target('STAFF'), teacher(null))).toBe(true)
  })
})

describe('a student is reached through where they are enrolled', () => {
  it('by their section, and not another', () => {
    expect(targetReaches(target('SECTION', { sectionId: SEC_A }), student())).toBe(true)
    expect(targetReaches(target('SECTION', { sectionId: SEC_B }), student())).toBe(false)
  })

  it('by their group, class, division and programme', () => {
    expect(targetReaches(target('GROUP', { academicGroupId: GROUP_A }), student())).toBe(true)
    expect(targetReaches(target('CLASS', { classId: CLASS_1 }), student())).toBe(true)
    expect(targetReaches(target('DIVISION', { divisionId: DIV_BOYS }), student())).toBe(true)
    expect(targetReaches(target('PROGRAM', { programId: PROG_PM }), student())).toBe(true)
  })

  it('and not by somebody else’s', () => {
    expect(targetReaches(target('GROUP', { academicGroupId: GROUP_B }), student())).toBe(false)
    expect(targetReaches(target('CLASS', { classId: CLASS_2 }), student())).toBe(false)
    expect(targetReaches(target('DIVISION', { divisionId: DIV_GIRLS }), student())).toBe(false)
    expect(targetReaches(target('PROGRAM', { programId: PROG_ICS }), student())).toBe(false)
  })

  it('reaches nothing structural when the student is not enrolled', () => {
    for (const t of [
      target('SECTION', { sectionId: SEC_A }),
      target('GROUP', { academicGroupId: GROUP_A }),
      target('CLASS', { classId: CLASS_1 }),
    ]) {
      expect(targetReaches(t, student(null))).toBe(false)
    }
  })
})

describe('a teacher is reached through where they teach', () => {
  it('by a section they are assigned to, and not one they are not', () => {
    expect(targetReaches(target('SECTION', { sectionId: SEC_A }), teacher())).toBe(true)
    expect(targetReaches(target('SECTION', { sectionId: SEC_B }), teacher())).toBe(false)
  })

  it('by the group, class, division and programme those sections belong to', () => {
    expect(targetReaches(target('GROUP', { academicGroupId: GROUP_A }), teacher())).toBe(true)
    expect(targetReaches(target('CLASS', { classId: CLASS_1 }), teacher())).toBe(true)
    expect(targetReaches(target('DIVISION', { divisionId: DIV_BOYS }), teacher())).toBe(true)
    expect(targetReaches(target('PROGRAM', { programId: PROG_PM }), teacher())).toBe(true)
  })

  it('and not by parts of the structure they do not teach in', () => {
    expect(targetReaches(target('GROUP', { academicGroupId: GROUP_B }), teacher())).toBe(false)
    expect(targetReaches(target('CLASS', { classId: CLASS_2 }), teacher())).toBe(false)
    expect(targetReaches(target('DIVISION', { divisionId: DIV_GIRLS }), teacher())).toBe(false)
    expect(targetReaches(target('PROGRAM', { programId: PROG_ICS }), teacher())).toBe(false)
  })

  it('reaches a teacher with several sections through any of them', () => {
    const t = teacher(scope({ sectionIds: [SEC_A, SEC_B] }))
    expect(targetReaches(target('SECTION', { sectionId: SEC_B }), t)).toBe(true)
  })

  it('reaches nothing structural when the teacher has no assignments', () => {
    expect(targetReaches(target('SECTION', { sectionId: SEC_A }), teacher(null))).toBe(false)
    expect(targetReaches(target('CLASS', { classId: CLASS_1 }), teacher(null))).toBe(false)
  })
})

describe('an administrator is reached by everything', () => {
  it('including a target for a section that is not theirs, because they manage it', () => {
    expect(targetReaches(target('SECTION', { sectionId: SEC_B }), admin)).toBe(true)
    expect(targetReaches(target('STUDENTS'), admin)).toBe(true)
  })
})

describe('a notice reaches a reader through any one of its targets', () => {
  it('one matching target is enough', () => {
    const targets = [target('SECTION', { sectionId: SEC_B }), target('CLASS', { classId: CLASS_1 })]
    expect(isTargeted(targets, student())).toBe(true)
  })

  it('no matching target means not reached', () => {
    const targets = [target('SECTION', { sectionId: SEC_B }), target('CLASS', { classId: CLASS_2 })]
    expect(isTargeted(targets, student())).toBe(false)
  })

  it('a notice with no targets reaches nobody but the office', () => {
    expect(isTargeted([], student())).toBe(false)
    expect(isTargeted([], teacher())).toBe(false)
    expect(isTargeted([], admin)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* When a notice shows                                                        */
/* -------------------------------------------------------------------------- */

describe('the publish window', () => {
  const now = new Date('2026-09-07T10:00:00Z')
  const window = (over: Partial<Parameters<typeof checkPublishWindow>[0]> = {}) => ({
    status: 'PUBLISHED' as const,
    publishAt: new Date('2026-09-07T08:00:00Z'),
    expiresAt: null,
    ...over,
  })

  it('is open for a published notice whose time has come', () => {
    expect(checkPublishWindow(window(), now)).toEqual({ open: true })
  })

  it('is closed for a draft, whatever the dates say', () => {
    expect(checkPublishWindow(window({ status: 'DRAFT' }), now)).toEqual({
      open: false,
      reason: 'DRAFT',
    })
  })

  it('is closed for an archived notice', () => {
    expect(checkPublishWindow(window({ status: 'ARCHIVED' }), now)).toEqual({
      open: false,
      reason: 'ARCHIVED',
    })
  })

  it('is closed before publishAt, and opens exactly at it', () => {
    expect(checkPublishWindow(window({ publishAt: new Date('2026-09-07T10:00:01Z') }), now)).toEqual({
      open: false,
      reason: 'NOT_YET',
    })
    expect(checkPublishWindow(window({ publishAt: now }), now)).toEqual({ open: true })
  })

  it('is open until expiresAt, and closed exactly at it', () => {
    expect(
      checkPublishWindow(window({ expiresAt: new Date('2026-09-07T10:00:01Z') }), now),
    ).toEqual({ open: true })
    expect(checkPublishWindow(window({ expiresAt: now }), now)).toEqual({
      open: false,
      reason: 'EXPIRED',
    })
  })

  it('accepts ISO strings as well as dates, since rows arrive serialised', () => {
    expect(
      checkPublishWindow(
        { status: 'PUBLISHED', publishAt: '2026-09-07T08:00:00Z', expiresAt: '2026-09-08T08:00:00Z' },
        now,
      ),
    ).toEqual({ open: true })
  })
})

/* -------------------------------------------------------------------------- */
/* The whole decision                                                         */
/* -------------------------------------------------------------------------- */

describe('does this reader see this notice right now', () => {
  const now = new Date('2026-09-07T10:00:00Z')
  const notice = (over: Record<string, unknown> = {}) => ({
    status: 'PUBLISHED' as const,
    publishAt: new Date('2026-09-07T08:00:00Z'),
    expiresAt: null,
    targets: [target('SECTION', { sectionId: SEC_A })],
    ...over,
  })

  it('yes, for a targeted student inside the window', () => {
    expect(decideNoticeVisible(notice(), student(), now)).toEqual({ visible: true })
  })

  it('no, for a student in another section', () => {
    expect(decideNoticeVisible(notice(), student(placement({ sectionId: SEC_B })), now)).toEqual({
      visible: false,
      reason: 'NOT_TARGETED',
    })
  })

  it('no, for a draft -- and the reason is the draft, not the audience', () => {
    expect(decideNoticeVisible(notice({ status: 'DRAFT' }), student(), now)).toEqual({
      visible: false,
      reason: 'DRAFT',
    })
  })

  it('no, before its time and after its expiry', () => {
    expect(
      decideNoticeVisible(notice({ publishAt: new Date('2026-09-08T08:00:00Z') }), student(), now),
    ).toEqual({ visible: false, reason: 'NOT_YET' })
    expect(
      decideNoticeVisible(notice({ expiresAt: new Date('2026-09-07T09:00:00Z') }), student(), now),
    ).toEqual({ visible: false, reason: 'EXPIRED' })
  })

  it('yes, for the office, in every state', () => {
    expect(decideNoticeVisible(notice({ status: 'DRAFT' }), admin, now)).toEqual({ visible: true })
    expect(decideNoticeVisible(notice({ status: 'ARCHIVED', targets: [] }), admin, now)).toEqual({
      visible: true,
    })
  })

  it('yes, for the teacher of that section; no, for another teacher', () => {
    expect(decideNoticeVisible(notice(), teacher(), now)).toEqual({ visible: true })
    expect(decideNoticeVisible(notice(), teacher(scope({ sectionIds: [SEC_B] })), now)).toEqual({
      visible: false,
      reason: 'NOT_TARGETED',
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

describe('events', () => {
  it('may only be for a whole population', () => {
    expect(isEventAudience('ALL')).toBe(true)
    expect(isEventAudience('STUDENTS')).toBe(true)
    expect(isEventAudience('STAFF')).toBe(true)
    expect(isEventAudience('SECTION')).toBe(false)
    expect(isEventAudience('CLASS')).toBe(false)
  })

  it('a published event for everyone is seen by everyone', () => {
    for (const role of ['ADMIN', 'STAFF', 'STUDENT'] as const) {
      expect(decideEventVisible({ status: 'PUBLISHED', audience: 'ALL' }, role)).toEqual({
        visible: true,
      })
    }
  })

  it('a students’ event is not seen by staff, and a staff event not by students', () => {
    expect(decideEventVisible({ status: 'PUBLISHED', audience: 'STUDENTS' }, 'STAFF')).toEqual({
      visible: false,
      reason: 'NOT_FOR_YOU',
    })
    expect(decideEventVisible({ status: 'PUBLISHED', audience: 'STAFF' }, 'STUDENT')).toEqual({
      visible: false,
      reason: 'NOT_FOR_YOU',
    })
    expect(decideEventVisible({ status: 'PUBLISHED', audience: 'STUDENTS' }, 'STUDENT')).toEqual({
      visible: true,
    })
  })

  it('a draft is the office’s alone', () => {
    expect(decideEventVisible({ status: 'DRAFT', audience: 'ALL' }, 'STUDENT')).toEqual({
      visible: false,
      reason: 'DRAFT',
    })
    expect(decideEventVisible({ status: 'DRAFT', audience: 'ALL' }, 'ADMIN')).toEqual({ visible: true })
  })

  it('a cancelled event is still shown, so people find out', () => {
    expect(decideEventVisible({ status: 'CANCELLED', audience: 'ALL' }, 'STUDENT')).toEqual({
      visible: true,
    })
  })
})

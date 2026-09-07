import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_LABEL,
  AUDIENCES,
  NOTICE_CATEGORIES,
  collegeLocalDateTime,
  eventCreateSchema,
  eventFeedQuerySchema,
  eventListQuerySchema,
  eventStatusSchema,
  noticeCreateSchema,
  noticeFeedQuerySchema,
  noticeListQuerySchema,
  noticeStatusSchema,
  noticeTargetSchema,
} from '@/validation/notices'
import { ROLE_DEFAULT_PERMISSIONS } from '@/server/auth/permissions'

/**
 * The notice and event forms, checked with the same schemas the API uses.
 *
 * The browser copy is a convenience; this is the copy that decides whether a
 * request is well formed. Whether the ids in it exist, and who may see the
 * result, are separate questions settled in the service and the policy.
 */

const CLASS = '11111111-1111-4111-8111-111111111111'
const SECTION = '22222222-2222-4222-8222-222222222222'

const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.path.join('.'))

/* -------------------------------------------------------------------------- */

describe('a time on the college clock', () => {
  it('accepts what a datetime-local input sends', () => {
    for (const v of ['2026-09-08T08:00', '2026-01-01T00:00', '2026-12-31T23:59']) {
      expect(collegeLocalDateTime.safeParse(v).success).toBe(true)
    }
  })

  it('refuses zones, seconds, dates alone and nonsense', () => {
    for (const v of ['2026-09-08T08:00:00Z', '2026-09-08T08:00+05:00', '2026-09-08', '08:00', '2026-09-08T24:00', '']) {
      expect(collegeLocalDateTime.safeParse(v).success).toBe(false)
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('a target', () => {
  it('lists the eight audiences, each with a label', () => {
    expect(AUDIENCES).toHaveLength(8)
    for (const a of AUDIENCES) expect(AUDIENCE_LABEL[a]).toBeTruthy()
  })

  it('accepts a population with no id, and a section with its id', () => {
    expect(noticeTargetSchema.safeParse({ audience: 'ALL' }).success).toBe(true)
    expect(noticeTargetSchema.safeParse({ audience: 'SECTION', sectionId: SECTION }).success).toBe(true)
  })

  it('points at the exact field when the ids do not match the audience', () => {
    expect(paths(noticeTargetSchema.safeParse({ audience: 'SECTION' }))).toEqual(['sectionId'])
    expect(paths(noticeTargetSchema.safeParse({ audience: 'ALL', classId: CLASS }))).toEqual(['classId'])
    expect(paths(noticeTargetSchema.safeParse({ audience: 'CLASS', classId: CLASS, sectionId: SECTION }))).toEqual([
      'sectionId',
    ])
  })

  it('treats an empty select as no id, the way a form sends it', () => {
    expect(noticeTargetSchema.safeParse({ audience: 'ALL', classId: '', sectionId: '' }).success).toBe(true)
  })

  it('refuses an id that is not an identifier', () => {
    expect(noticeTargetSchema.safeParse({ audience: 'CLASS', classId: 'first-year' }).success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('a notice', () => {
  const valid = {
    title: 'Sports day',
    body: 'The annual sports day is on Friday.',
    targets: [{ audience: 'ALL' }],
  }

  it('accepts the minimum: a title, a body and one audience', () => {
    const parsed = noticeCreateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.category).toBe('GENERAL')
      expect(parsed.data.isPinned).toBe(false)
      expect(parsed.data.publishAt).toBeUndefined()
    }
  })

  it('needs a title and a body', () => {
    expect(paths(noticeCreateSchema.safeParse({ ...valid, title: '  ' }))).toContain('title')
    expect(paths(noticeCreateSchema.safeParse({ ...valid, body: '' }))).toContain('body')
  })

  it('needs at least one audience', () => {
    expect(paths(noticeCreateSchema.safeParse({ ...valid, targets: [] }))).toContain('targets')
  })

  it('refuses the same audience twice', () => {
    const r = noticeCreateSchema.safeParse({ ...valid, targets: [{ audience: 'ALL' }, { audience: 'ALL' }] })
    expect(paths(r)).toContain('targets')
  })

  it('refuses expiring before publishing, and points at expiresAt', () => {
    const r = noticeCreateSchema.safeParse({
      ...valid,
      publishAt: '2026-09-08T08:00',
      expiresAt: '2026-09-08T07:00',
    })
    expect(paths(r)).toContain('expiresAt')
  })

  it('accepts a window in the right order, and an expiry with no publish time', () => {
    expect(
      noticeCreateSchema.safeParse({ ...valid, publishAt: '2026-09-08T08:00', expiresAt: '2026-09-09T08:00' }).success,
    ).toBe(true)
    expect(noticeCreateSchema.safeParse({ ...valid, expiresAt: '2026-09-09T08:00' }).success).toBe(true)
  })

  it('knows the six categories', () => {
    expect(NOTICE_CATEGORIES).toEqual(['GENERAL', 'ACADEMIC', 'EXAM', 'EVENT', 'EMERGENCY', 'HOLIDAY'])
    expect(noticeCreateSchema.safeParse({ ...valid, category: 'GOSSIP' }).success).toBe(false)
  })

  it('accepts a status change only to a real status', () => {
    expect(noticeStatusSchema.safeParse({ status: 'PUBLISHED' }).success).toBe(true)
    expect(noticeStatusSchema.safeParse({ status: 'LIVE' }).success).toBe(false)
  })
})

describe('the office list and the reader feed', () => {
  it('the list may filter by status and category', () => {
    const parsed = noticeListQuerySchema.parse({ status: 'DRAFT', category: 'EXAM', page: '2' })
    expect(parsed).toMatchObject({ status: 'DRAFT', category: 'EXAM', page: 2, pageSize: 25 })
  })

  it('the feed offers no status and no audience to ask for', () => {
    const parsed = noticeFeedQuerySchema.parse({ status: 'DRAFT', sectionId: SECTION, category: 'EXAM' })
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('sectionId')
    expect(parsed.category).toBe('EXAM')
  })
})

/* -------------------------------------------------------------------------- */

describe('an event', () => {
  const valid = { title: 'Parents’ day', startsAt: '2026-10-01T09:00' }

  it('accepts a title and a start, defaulting to everyone', () => {
    const parsed = eventCreateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.audience).toBe('ALL')
  })

  it('may be for all students or all staff, but not for a section', () => {
    expect(eventCreateSchema.safeParse({ ...valid, audience: 'STUDENTS' }).success).toBe(true)
    expect(eventCreateSchema.safeParse({ ...valid, audience: 'STAFF' }).success).toBe(true)
    expect(eventCreateSchema.safeParse({ ...valid, audience: 'SECTION' }).success).toBe(false)
  })

  it('may end when it starts, but not before', () => {
    expect(eventCreateSchema.safeParse({ ...valid, endsAt: '2026-10-01T09:00' }).success).toBe(true)
    expect(paths(eventCreateSchema.safeParse({ ...valid, endsAt: '2026-10-01T08:59' }))).toContain('endsAt')
  })

  it('needs a start', () => {
    expect(paths(eventCreateSchema.safeParse({ title: 'x' }))).toContain('startsAt')
  })

  it('accepts a status change only to a real status', () => {
    expect(eventStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(true)
    expect(eventStatusSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false)
  })

  it('lists upcoming by default in the feed, and the past on request', () => {
    expect(eventFeedQuerySchema.parse({}).includePast).toBe(false)
    expect(eventFeedQuerySchema.parse({ includePast: 'true' }).includePast).toBe(true)
    expect(eventListQuerySchema.parse({ upcoming: 'true' }).upcoming).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */

describe('who may manage and who may read', () => {
  it('managing is an admin permission; reading is everyone’s', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain('notices.manage')
    expect(ROLE_DEFAULT_PERMISSIONS.ADMIN).toContain('events.manage')
    for (const role of ['STAFF', 'STUDENT'] as const) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toContain('notices.view')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toContain('events.view')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain('notices.manage')
      expect(ROLE_DEFAULT_PERMISSIONS[role]).not.toContain('events.manage')
    }
  })
})

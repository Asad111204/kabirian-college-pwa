import { describe, expect, it } from 'vitest'
import {
  DAYS_OF_WEEK,
  TIMETABLE_DAYS,
  myTimetableQuerySchema,
  sectionTimetableQuerySchema,
  teachingPeriod,
  timetableListQuerySchema,
  timetableSlotCreateSchema,
  timetableSlotUpdateSchema,
} from '@/validation/timetable'

/**
 * The shared timetable schemas.
 *
 * These run in the browser for instant feedback and on the server as the real
 * check. What matters here is what they refuse — including the two things the
 * browser must never be able to assert: which academic session a lesson belongs
 * to, and which teacher is asking.
 */

const SECTION = '11111111-1111-4111-8111-111111111111'
const SUBJECT = '22222222-2222-4222-8222-222222222222'
const STAFF = '33333333-3333-4333-8333-333333333333'
const SESSION = '44444444-4444-4444-8444-444444444444'

const lesson = (over: Record<string, unknown> = {}) => ({
  sectionId: SECTION,
  subjectId: SUBJECT,
  staffId: STAFF,
  dayOfWeek: 'MONDAY',
  period: 3,
  room: 'Lab 1',
  ...over,
})

describe('a proposed lesson', () => {
  it('accepts a complete one', () => {
    const parsed = timetableSlotCreateSchema.parse(lesson())
    expect(parsed.period).toBe(3)
    expect(parsed.dayOfWeek).toBe('MONDAY')
    expect(parsed.room).toBe('Lab 1')
  })

  it('treats an empty room as no room, not as an empty name', () => {
    expect(timetableSlotCreateSchema.parse(lesson({ room: '' })).room).toBeUndefined()
    expect(timetableSlotCreateSchema.parse(lesson({ room: '   ' })).room).toBeUndefined()
  })

  it('accepts a lesson with the room left out entirely', () => {
    const { room: _room, ...withoutRoom } = lesson()
    expect(timetableSlotCreateSchema.safeParse(withoutRoom).success).toBe(true)
  })

  it('refuses a room longer than the column holds', () => {
    expect(timetableSlotCreateSchema.safeParse(lesson({ room: 'x'.repeat(51) })).success).toBe(false)
  })

  it('refuses ids that are not ids', () => {
    for (const field of ['sectionId', 'subjectId', 'staffId']) {
      expect(timetableSlotCreateSchema.safeParse(lesson({ [field]: 'not-a-uuid' })).success).toBe(
        false,
      )
    }
  })

  it('refuses a day that is not a day', () => {
    expect(timetableSlotCreateSchema.safeParse(lesson({ dayOfWeek: 'FUNDAY' })).success).toBe(false)
    expect(timetableSlotCreateSchema.safeParse(lesson({ dayOfWeek: 'monday' })).success).toBe(false)
  })

  it('accepts every day the enum has', () => {
    for (const day of DAYS_OF_WEEK) {
      expect(timetableSlotCreateSchema.safeParse(lesson({ dayOfWeek: day })).success).toBe(true)
    }
  })

  it('accepts nothing else the browser tries to attach', () => {
    // Whatever else a caller sends is dropped here, so it cannot reach the
    // service and cannot reach the database.
    const parsed = timetableSlotCreateSchema.parse(
      lesson({ startTime: '08:00', endTime: '08:30', isActive: false, id: 'x' }),
    )
    expect(parsed).not.toHaveProperty('startTime')
    expect(parsed).not.toHaveProperty('endTime')
    expect(parsed).not.toHaveProperty('isActive')
    expect(parsed).not.toHaveProperty('id')
  })
})

describe('the period a lesson may occupy', () => {
  it('accepts every teaching period', () => {
    for (const period of [1, 2, 3, 4, 5, 7, 8, 9]) {
      expect(teachingPeriod.safeParse(period).success).toBe(true)
    }
  })

  it('refuses the break', () => {
    const result = teachingPeriod.safeParse(6)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/break/i)
    }
  })

  it('refuses a period outside the college day', () => {
    for (const period of [0, -1, 10, 100]) {
      expect(teachingPeriod.safeParse(period).success).toBe(false)
    }
  })

  it('refuses a fraction of a period', () => {
    expect(teachingPeriod.safeParse(3.5).success).toBe(false)
  })

  it('reads a number sent as text by a form', () => {
    expect(teachingPeriod.parse('7')).toBe(7)
  })
})

describe('editing a lesson', () => {
  it('changes what happens in the cell, not where it is', () => {
    const parsed = timetableSlotUpdateSchema.parse({
      subjectId: SUBJECT,
      staffId: STAFF,
      room: 'Room 2',
      dayOfWeek: 'FRIDAY',
      period: 9,
      sectionId: SECTION,
    })
    // Moving a lesson is clearing one cell and filling another, so none of
    // these may ride along on an edit.
    expect(parsed).not.toHaveProperty('dayOfWeek')
    expect(parsed).not.toHaveProperty('period')
    expect(parsed).not.toHaveProperty('sectionId')
  })

  it('still requires a subject and a teacher', () => {
    expect(timetableSlotUpdateSchema.safeParse({ room: 'Room 2' }).success).toBe(false)
  })
})

describe('a session sent with a new lesson', () => {
  it('is accepted, so the service can check it against the section', () => {
    const parsed = timetableSlotCreateSchema.parse(lesson({ academicSessionId: SESSION }))
    expect(parsed.academicSessionId).toBe(SESSION)
  })

  it('is optional, because the section already knows its own session', () => {
    expect(timetableSlotCreateSchema.parse(lesson()).academicSessionId).toBeUndefined()
  })

  it('still has to look like an id', () => {
    expect(
      timetableSlotCreateSchema.safeParse(lesson({ academicSessionId: 'last-year' })).success,
    ).toBe(false)
  })
})

describe('the admin listing filters', () => {
  it('require a session, because a timetable only means anything inside one', () => {
    expect(timetableListQuerySchema.safeParse({ academicSessionId: SESSION }).success).toBe(true)
    expect(timetableListQuerySchema.safeParse({}).success).toBe(false)
    expect(timetableListQuerySchema.safeParse({ academicSessionId: 'nope' }).success).toBe(false)
  })

  it('narrow by section and day when asked', () => {
    const parsed = timetableListQuerySchema.parse({
      academicSessionId: SESSION,
      sectionId: SECTION,
      dayOfWeek: 'TUESDAY',
    })
    expect(parsed.sectionId).toBe(SECTION)
    expect(parsed.dayOfWeek).toBe('TUESDAY')
  })

  it('refuse a day that is not a day', () => {
    expect(
      timetableListQuerySchema.safeParse({ academicSessionId: SESSION, dayOfWeek: 'FUNDAY' })
        .success,
    ).toBe(false)
  })

  it('leave removed lessons out unless the office asks', () => {
    expect(timetableListQuerySchema.parse({ academicSessionId: SESSION }).includeInactive).toBe(
      false,
    )
    expect(
      timetableListQuerySchema.parse({ academicSessionId: SESSION, includeInactive: 'true' })
        .includeInactive,
    ).toBe(true)
    // Anything that is not the word "true" means no.
    expect(
      timetableListQuerySchema.parse({ academicSessionId: SESSION, includeInactive: 'yes' })
        .includeInactive,
    ).toBe(false)
  })

  it('give nobody a staffId to point at somebody else', () => {
    const parsed = timetableListQuerySchema.parse({ academicSessionId: SESSION, staffId: STAFF })
    expect(parsed).not.toHaveProperty('staffId')
  })
})

describe('a teacher narrowing their own week', () => {
  it('may filter by session and day', () => {
    const parsed = myTimetableQuerySchema.parse({
      academicSessionId: SESSION,
      dayOfWeek: 'FRIDAY',
    })
    expect(parsed.academicSessionId).toBe(SESSION)
    expect(parsed.dayOfWeek).toBe('FRIDAY')
  })

  it('may ask for the whole current week', () => {
    expect(myTimetableQuerySchema.parse({}).academicSessionId).toBeUndefined()
  })

  it('has no staffId to send — whose week it is comes from the cookie', () => {
    const parsed = myTimetableQuerySchema.parse({ staffId: STAFF, sectionId: SECTION })
    expect(parsed).not.toHaveProperty('staffId')
    expect(parsed).not.toHaveProperty('sectionId')
  })

  it('refuses a malformed session id rather than ignoring it', () => {
    expect(myTimetableQuerySchema.safeParse({ academicSessionId: 'nope' }).success).toBe(false)
  })
})

describe('the builder query', () => {
  it('needs a section', () => {
    expect(sectionTimetableQuerySchema.safeParse({ sectionId: SECTION }).success).toBe(true)
    expect(sectionTimetableQuerySchema.safeParse({}).success).toBe(false)
    expect(sectionTimetableQuerySchema.safeParse({ sectionId: 'nope' }).success).toBe(false)
  })
})

describe('the grid the college teaches on', () => {
  it('runs Monday to Saturday', () => {
    expect(TIMETABLE_DAYS).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ])
  })

  it('leaves Sunday off the grid but keeps it a valid day', () => {
    expect(TIMETABLE_DAYS).not.toContain('SUNDAY')
    expect(DAYS_OF_WEEK).toContain('SUNDAY')
  })
})

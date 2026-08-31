import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The timetable schema, tested against a real PostgreSQL.
 *
 * Every migration is replayed in order onto a throwaway in-memory database and
 * then the rules are attacked. This is also how the new migration is proved to
 * apply cleanly on top of the eight already in the history — the college's own
 * database is never touched by these tests.
 *
 * All three clashes — the section's, the teacher's and the room's — are partial
 * unique indexes over ACTIVE rows, so a removed lesson never holds its cell.
 * The service checks them first because a person needs a readable message, but
 * these are what hold when two administrators save the same period at the same
 * moment and each passes its own check before either has written.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

let db: PGlite

const ID = {
  session: '11111111-1111-1111-1111-111111111111',
  otherSession: '11111111-1111-1111-1111-111111111112',
  class: '22222222-2222-2222-2222-222222222221',
  division: '22222222-2222-2222-2222-222222222222',
  program: '22222222-2222-2222-2222-222222222223',
  group: '33333333-3333-3333-3333-333333333331',
  otherGroup: '33333333-3333-3333-3333-333333333332',
  section: '44444444-4444-4444-4444-444444444441',
  sectionB: '44444444-4444-4444-4444-444444444443',
  otherSection: '44444444-4444-4444-4444-444444444442',
  biology: '55555555-5555-5555-5555-555555555551',
  chemistry: '55555555-5555-5555-5555-555555555552',
  designation: '77777777-7777-7777-7777-777777777771',
  staff: '88888888-8888-8888-8888-888888888881',
  staff2: '88888888-8888-8888-8888-888888888882',
}

let counter = 0
function uid(): string {
  counter += 1
  return `bbbbbbbb-0000-0000-0000-${String(counter).padStart(12, '0')}`
}

beforeAll(async () => {
  db = await PGlite.create()

  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
    await db.exec(sql)
  }

  await db.exec(`
    INSERT INTO academic_sessions (id, name, start_date, end_date, is_current, status, created_at, updated_at) VALUES
      ('${ID.session}', '2026-27', '2026-04-01', '2027-03-31', true, 'ACTIVE', now(), now()),
      ('${ID.otherSession}', '2027-28', '2027-04-01', '2028-03-31', false, 'UPCOMING', now(), now());

    INSERT INTO classes (id, name, code, level, is_active, created_at, updated_at)
      VALUES ('${ID.class}', '1st Year', '11', 1, true, now(), now());
    INSERT INTO divisions (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.division}', 'Boys', 'B', 1, true, now(), now());
    INSERT INTO programs (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.program}', 'Pre-Medical', 'PM', 1, true, now(), now());
    INSERT INTO subjects (id, name, code, is_active, created_at, updated_at) VALUES
      ('${ID.biology}', 'Biology', 'BIO', true, now(), now()),
      ('${ID.chemistry}', 'Chemistry', 'CHEM', true, now(), now());

    INSERT INTO academic_groups (id, academic_session_id, class_id, division_id, program_id, is_active, created_at, updated_at) VALUES
      ('${ID.group}', '${ID.session}', '${ID.class}', '${ID.division}', '${ID.program}', true, now(), now()),
      ('${ID.otherGroup}', '${ID.otherSession}', '${ID.class}', '${ID.division}', '${ID.program}', true, now(), now());

    INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at) VALUES
      ('${ID.section}', '${ID.group}', '${ID.session}', 'A', true, now(), now()),
      ('${ID.sectionB}', '${ID.group}', '${ID.session}', 'B', true, now(), now()),
      ('${ID.otherSection}', '${ID.otherGroup}', '${ID.otherSession}', 'A', true, now(), now());

    INSERT INTO designations (id, name, code, is_active, sort_order, created_at, updated_at)
      VALUES ('${ID.designation}', 'Lecturer', 'LEC', true, 1, now(), now());
    INSERT INTO staff (id, staff_code, full_name, designation_id, staff_type, employment_status, joining_date, created_at, updated_at) VALUES
      ('${ID.staff}', 'STF-0001', 'Sara Khan', '${ID.designation}', 'TEACHING', 'ACTIVE', '2026-04-01', now(), now()),
      ('${ID.staff2}', 'STF-0002', 'Imran Ali', '${ID.designation}', 'TEACHING', 'ACTIVE', '2026-04-01', now(), now());
  `)
}, 60_000)

/* -------------------------------------------------------------------------- */

interface SlotOptions {
  id?: string
  section?: string
  session?: string
  subject?: string
  staff?: string
  day?: string
  period?: number
  room?: string | null
}

async function insertSlot(options: SlotOptions = {}): Promise<string> {
  const id = options.id ?? uid()
  await db.query(
    `INSERT INTO timetable_slots
       (id, section_id, academic_session_id, subject_id, staff_id, day_of_week, period, room, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      options.section ?? ID.section,
      options.session ?? ID.session,
      options.subject ?? ID.biology,
      options.staff ?? ID.staff,
      options.day ?? 'MONDAY',
      options.period ?? 1,
      options.room === undefined ? 'Lab 1' : options.room,
    ],
  )
  return id
}

const rejects = async (fn: () => Promise<unknown>) => {
  await expect(fn()).rejects.toThrow()
}

/* -------------------------------------------------------------------------- */

describe('the migration applies on top of the existing history', () => {
  it('creates the timetable_slots table', async () => {
    const r = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables
       WHERE table_name = 'timetable_slots'`,
    )
    expect(r.rows[0]?.count).toBe('1')
  })

  it('creates the day_of_week enum with the seven days', async () => {
    const r = await db.query<{ label: string }>(
      `SELECT e.enumlabel AS label FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'day_of_week' ORDER BY e.enumsortorder`,
    )
    expect(r.rows.map((x) => x.label)).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ])
  })

  it('stores the period as a smallint, and no clock times at all', async () => {
    const r = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'timetable_slots'`,
    )
    const columns = new Map(r.rows.map((c) => [c.column_name, c.data_type]))
    expect(columns.get('period')).toBe('smallint')
    expect(columns.has('start_time')).toBe(false)
    expect(columns.has('end_time')).toBe(false)
  })

  it('leaves the tables the college already uses alone', async () => {
    for (const table of ['attendance_sheets', 'results', 'marks', 'students', 'staff']) {
      const r = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_name = $1`,
        [table],
      )
      expect(r.rows[0]?.count).toBe('1')
    }
    // The register's own period column is untouched by this migration.
    const period = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'attendance_sheets' AND column_name = 'period'`,
    )
    expect(period.rows[0]?.column_default).toBe('1')
  })
})

describe('a section can only be doing one thing at a time', () => {
  it('accepts the first lesson in a cell', async () => {
    await expect(insertSlot({ day: 'TUESDAY', period: 1 })).resolves.toBeTruthy()
  })

  it('refuses a second lesson for the same section, day and period', async () => {
    await insertSlot({ day: 'TUESDAY', period: 2 })
    await rejects(() =>
      insertSlot({ day: 'TUESDAY', period: 2, subject: ID.chemistry, staff: ID.staff2 }),
    )
  })

  it('accepts the same period for a different section', async () => {
    // Different teacher and different room, so the section rule is the only
    // one in play here.
    await insertSlot({ day: 'WEDNESDAY', period: 1, room: 'Room 1' })
    await expect(
      insertSlot({
        section: ID.sectionB,
        day: 'WEDNESDAY',
        period: 1,
        staff: ID.staff2,
        room: 'Room 2',
      }),
    ).resolves.toBeTruthy()
  })

  it('accepts the same period on a different day', async () => {
    await insertSlot({ day: 'THURSDAY', period: 3 })
    await expect(insertSlot({ day: 'FRIDAY', period: 3 })).resolves.toBeTruthy()
  })

  it('frees the cell again once the lesson is deactivated', async () => {
    // The uniqueness is a PARTIAL index over active rows only. Without that, a
    // removed lesson would hold its cell for ever and the timetable could never
    // be rearranged.
    const first = await insertSlot({ day: 'FRIDAY', period: 5 })
    await rejects(() => insertSlot({ day: 'FRIDAY', period: 5, subject: ID.chemistry }))

    await db.query(`UPDATE timetable_slots SET is_active = false WHERE id = $1`, [first])
    await expect(
      insertSlot({ day: 'FRIDAY', period: 5, subject: ID.chemistry }),
    ).resolves.toBeTruthy()
  })

  it('keeps the removed lesson as history rather than deleting it', async () => {
    const id = await insertSlot({ day: 'FRIDAY', period: 7 })
    await db.query(`UPDATE timetable_slots SET is_active = false WHERE id = $1`, [id])
    const r = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM timetable_slots WHERE id = $1`,
      [id],
    )
    expect(r.rows[0]?.count).toBe('1')
  })

  it('is a partial index, so many inactive rows may share one cell', async () => {
    for (const subject of [ID.biology, ID.chemistry, ID.biology]) {
      const id = await insertSlot({ day: 'SATURDAY', period: 8, subject })
      await db.query(`UPDATE timetable_slots SET is_active = false WHERE id = $1`, [id])
    }
    const r = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM timetable_slots
       WHERE day_of_week = 'SATURDAY' AND period = 8 AND is_active = false`,
    )
    expect(r.rows[0]?.count).toBe('3')
  })
})

describe('a lesson cannot escape its own academic session', () => {
  it('refuses a section that belongs to another session', async () => {
    await rejects(() => insertSlot({ section: ID.otherSection, day: 'SATURDAY', period: 1 }))
  })

  it('accepts the section of the session named on the row', async () => {
    await expect(
      insertSlot({
        section: ID.otherSection,
        session: ID.otherSession,
        day: 'SATURDAY',
        period: 2,
      }),
    ).resolves.toBeTruthy()
  })
})

describe('a lesson must point at real people and real subjects', () => {
  it('refuses an unknown subject', async () => {
    await rejects(() => insertSlot({ subject: uid(), day: 'MONDAY', period: 5 }))
  })

  it('refuses an unknown teacher', async () => {
    await rejects(() => insertSlot({ staff: uid(), day: 'MONDAY', period: 6 }))
  })

  it('refuses a day that is not a day', async () => {
    await rejects(() => insertSlot({ day: 'FUNDAY', period: 4 }))
  })
})

describe('a teacher cannot be booked twice in one period', () => {
  // These are the checks that make a simultaneous save safe. The service checks
  // first so a person gets a readable message; these prove that even a writer
  // which has already passed that check cannot land the conflicting row.
  it('refuses the same teacher in two sections in the same period', async () => {
    await insertSlot({ day: 'MONDAY', period: 8, staff: ID.staff, room: 'Room 1' })
    await rejects(() =>
      insertSlot({
        section: ID.sectionB,
        day: 'MONDAY',
        period: 8,
        staff: ID.staff,
        room: 'Room 2',
      }),
    )
  })

  it('allows a different teacher in that period', async () => {
    await insertSlot({ day: 'TUESDAY', period: 8, staff: ID.staff, room: 'Room 1' })
    await expect(
      insertSlot({
        section: ID.sectionB,
        day: 'TUESDAY',
        period: 8,
        staff: ID.staff2,
        room: 'Room 2',
      }),
    ).resolves.toBeTruthy()
  })

  it('frees the teacher again once the lesson is deactivated', async () => {
    const id = await insertSlot({ day: 'WEDNESDAY', period: 9, staff: ID.staff, room: 'Room 1' })
    await rejects(() =>
      insertSlot({ section: ID.sectionB, day: 'WEDNESDAY', period: 9, staff: ID.staff, room: 'R2' }),
    )
    await db.query('UPDATE timetable_slots SET is_active = false WHERE id = $1', [id])
    await expect(
      insertSlot({ section: ID.sectionB, day: 'WEDNESDAY', period: 9, staff: ID.staff, room: 'R2' }),
    ).resolves.toBeTruthy()
  })

  it('refuses a teacher moved into an occupied period by an UPDATE', async () => {
    await insertSlot({ day: 'THURSDAY', period: 8, staff: ID.staff, room: 'Room 1' })
    const moving = await insertSlot({
      section: ID.sectionB,
      day: 'THURSDAY',
      period: 8,
      staff: ID.staff2,
      room: 'Room 2',
    })
    await expect(
      db.query('UPDATE timetable_slots SET staff_id = $1 WHERE id = $2', [ID.staff, moving]),
    ).rejects.toThrow()
  })
})

describe('a room cannot hold two lessons at once', () => {
  it('refuses the same room in the same period', async () => {
    await insertSlot({ day: 'MONDAY', period: 9, room: 'Hall' })
    await rejects(() =>
      insertSlot({ section: ID.sectionB, day: 'MONDAY', period: 9, staff: ID.staff2, room: 'Hall' }),
    )
  })

  it('is not fooled by case or surrounding spaces', async () => {
    await insertSlot({ day: 'TUESDAY', period: 9, room: 'Lab 1' })
    await rejects(() =>
      insertSlot({
        section: ID.sectionB,
        day: 'TUESDAY',
        period: 9,
        staff: ID.staff2,
        room: '  lab 1 ',
      }),
    )
  })

  it('lets lessons with no room share a period', async () => {
    await insertSlot({ day: 'FRIDAY', period: 9, room: null, staff: ID.staff })
    await expect(
      insertSlot({ section: ID.sectionB, day: 'FRIDAY', period: 9, staff: ID.staff2, room: null }),
    ).resolves.toBeTruthy()
  })

  it('treats a blank room as no room', async () => {
    await insertSlot({ day: 'SATURDAY', period: 9, room: '   ', staff: ID.staff })
    await expect(
      insertSlot({ section: ID.sectionB, day: 'SATURDAY', period: 9, staff: ID.staff2, room: '' }),
    ).resolves.toBeTruthy()
  })

  it('allows the same room in a different period', async () => {
    await insertSlot({ day: 'MONDAY', period: 4, room: 'Hall' })
    await expect(
      insertSlot({ section: ID.sectionB, day: 'MONDAY', period: 5, staff: ID.staff2, room: 'Hall' }),
    ).resolves.toBeTruthy()
  })
})

describe('two administrators saving the same period at the same moment', () => {
  // The race the service alone cannot close: both writers pass their own check
  // before either has written. Issued together, exactly one may land.
  const raced = async (a: () => Promise<unknown>, b: () => Promise<unknown>) => {
    const results = await Promise.allSettled([a(), b()])
    return results.filter((r) => r.status === 'fulfilled').length
  }

  it('lets only one of two lessons take a section cell', async () => {
    const won = await raced(
      () => insertSlot({ day: 'SUNDAY', period: 1, staff: ID.staff, room: 'A' }),
      () => insertSlot({ day: 'SUNDAY', period: 1, staff: ID.staff2, room: 'B' }),
    )
    expect(won).toBe(1)
  })

  it('lets only one of two lessons take a teacher', async () => {
    const won = await raced(
      () => insertSlot({ day: 'SUNDAY', period: 2, staff: ID.staff, room: 'A' }),
      () =>
        insertSlot({ section: ID.sectionB, day: 'SUNDAY', period: 2, staff: ID.staff, room: 'B' }),
    )
    expect(won).toBe(1)
  })

  it('lets only one of two lessons take a room', async () => {
    const won = await raced(
      () => insertSlot({ day: 'SUNDAY', period: 3, staff: ID.staff, room: 'Hall' }),
      () =>
        insertSlot({
          section: ID.sectionB,
          day: 'SUNDAY',
          period: 3,
          staff: ID.staff2,
          room: 'HALL',
        }),
    )
    expect(won).toBe(1)
  })

  it('still lets two genuinely independent lessons through together', async () => {
    const won = await raced(
      () => insertSlot({ day: 'SUNDAY', period: 4, staff: ID.staff, room: 'A' }),
      () =>
        insertSlot({ section: ID.sectionB, day: 'SUNDAY', period: 4, staff: ID.staff2, room: 'B' }),
    )
    expect(won).toBe(2)
  })
})

describe('the row defaults', () => {
  it('starts active, and accepts a lesson with no room', async () => {
    const id = await insertSlot({ day: 'TUESDAY', period: 7, room: null })
    const r = await db.query<{ is_active: boolean; room: string | null }>(
      `SELECT is_active, room FROM timetable_slots WHERE id = $1`,
      [id],
    )
    expect(r.rows[0]?.is_active).toBe(true)
    expect(r.rows[0]?.room).toBeNull()
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The attendance schema, tested against a real PostgreSQL.
 *
 * These are not unit tests of application code — they check the rules the
 * *database* enforces, by applying every migration in order to a throwaway
 * in-memory PostgreSQL and then trying to break them.
 *
 * That matters because these particular rules cannot be enforced anywhere else
 * honestly. A service can forget to check for a duplicate register; a unique
 * index cannot. And one of them (`NULLS NOT DISTINCT`) is hand-written SQL that
 * Prisma cannot express, so without a test nothing would notice if a future
 * migration dropped it.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

let db: PGlite

/** Ids used across the fixtures. */
const ID = {
  session: '11111111-1111-1111-1111-111111111111',
  otherSession: '11111111-1111-1111-1111-111111111112',
  class: '22222222-2222-2222-2222-222222222221',
  division: '22222222-2222-2222-2222-222222222222',
  program: '22222222-2222-2222-2222-222222222223',
  group: '33333333-3333-3333-3333-333333333331',
  otherGroup: '33333333-3333-3333-3333-333333333332',
  section: '44444444-4444-4444-4444-444444444441',
  otherSection: '44444444-4444-4444-4444-444444444442',
  biology: '55555555-5555-5555-5555-555555555551',
  chemistry: '55555555-5555-5555-5555-555555555552',
  student: '66666666-6666-6666-6666-666666666661',
  student2: '66666666-6666-6666-6666-666666666662',
  designation: '77777777-7777-7777-7777-777777777771',
  staff: '88888888-8888-8888-8888-888888888881',
  user: '99999999-9999-9999-9999-999999999991',
}

/** A fresh uuid for each row we insert, so tests never collide. */
let counter = 0
function uid(): string {
  counter += 1
  return `aaaaaaaa-0000-0000-0000-${String(counter).padStart(12, '0')}`
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
      ('${ID.otherSection}', '${ID.otherGroup}', '${ID.otherSession}', 'A', true, now(), now());

    INSERT INTO students (id, student_code, admission_number, full_name, father_name, gender, admission_date, admission_session_id, status, created_at, updated_at) VALUES
      ('${ID.student}', 'STU-0001', 'ADM-00001', 'Ali Raza', 'Raza Khan', 'MALE', '2026-04-01', '${ID.session}', 'ACTIVE', now(), now()),
      ('${ID.student2}', 'STU-0002', 'ADM-00002', 'Bilal Ahmed', 'Ahmed Khan', 'MALE', '2026-04-01', '${ID.session}', 'ACTIVE', now(), now());

    INSERT INTO student_enrollments (id, student_id, academic_session_id, section_id, roll_number, status, start_date, created_at, updated_at) VALUES
      ('${uid()}', '${ID.student}', '${ID.session}', '${ID.section}', '1', 'ACTIVE', '2026-04-01', now(), now());

    INSERT INTO designations (id, name, code, is_active, sort_order, created_at, updated_at)
      VALUES ('${ID.designation}', 'Lecturer', 'LEC', true, 1, now(), now());
    INSERT INTO staff (id, staff_code, full_name, designation_id, staff_type, employment_status, joining_date, created_at, updated_at)
      VALUES ('${ID.staff}', 'STF-0001', 'Sara Khan', '${ID.designation}', 'TEACHING', 'ACTIVE', '2026-04-01', now(), now());
    INSERT INTO users (id, username, password_hash, role, status, must_change_password, failed_login_attempts, is_system_owner, created_at, updated_at)
      VALUES ('${ID.user}', 'admin', 'x', 'ADMIN', 'ACTIVE', false, 0, true, now(), now());
  `)
}, 60_000)

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface SheetOptions {
  id?: string
  section?: string
  session?: string
  subject?: string | null
  date?: string
  period?: number
  status?: string
}

async function insertSheet(options: SheetOptions = {}): Promise<string> {
  const id = options.id ?? uid()
  const subject = options.subject === undefined ? ID.biology : options.subject
  await db.query(
    `INSERT INTO attendance_sheets
       (id, section_id, academic_session_id, subject_id, date, period, marked_by_staff_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      options.section ?? ID.section,
      options.session ?? ID.session,
      subject,
      options.date ?? '2026-09-01',
      options.period ?? 1,
      ID.staff,
      options.status ?? 'DRAFT',
    ],
  )
  return id
}

async function insertEntry(
  sheetId: string,
  options: { student?: string; status?: string; session?: string; date?: string } = {},
): Promise<string> {
  const id = uid()
  await db.query(
    `INSERT INTO attendance_entries
       (id, sheet_id, student_id, status, academic_session_id, date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [
      id,
      sheetId,
      options.student ?? ID.student,
      options.status ?? 'PRESENT',
      options.session ?? ID.session,
      options.date ?? '2026-09-01',
    ],
  )
  return id
}

/** Runs a query and reports whether the database refused it. */
async function refused(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('creating attendance sheets', () => {
  it('accepts a subject-wise sheet', async () => {
    const id = await insertSheet({ subject: ID.biology, date: '2026-09-10' })
    const result = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM attendance_sheets WHERE id = $1`,
      [id],
    )
    expect(result.rows[0]?.n).toBe(1)
  })

  it('accepts a daily sheet with no subject', async () => {
    const id = await insertSheet({ subject: null, date: '2026-09-11' })
    const result = await db.query<{ subject_id: string | null }>(
      `SELECT subject_id FROM attendance_sheets WHERE id = $1`,
      [id],
    )
    expect(result.rows[0]?.subject_id).toBeNull()
  })

  it('defaults a sheet to DRAFT and period 1', async () => {
    const id = uid()
    await db.query(
      `INSERT INTO attendance_sheets (id, section_id, academic_session_id, subject_id, date, marked_by_staff_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '2026-09-12', $5, now(), now())`,
      [id, ID.section, ID.session, ID.biology, ID.staff],
    )
    const row = await db.query<{ status: string; period: number }>(
      `SELECT status, period FROM attendance_sheets WHERE id = $1`,
      [id],
    )
    expect(row.rows[0]).toMatchObject({ status: 'DRAFT', period: 1 })
  })

  it('accepts every sheet status', async () => {
    for (const [i, status] of ['DRAFT', 'SUBMITTED', 'CANCELLED'].entries()) {
      await expect(insertSheet({ status, date: `2026-10-0${i + 1}` })).resolves.toBeTruthy()
    }
  })

  it('refuses a sheet status that is not in the enum', async () => {
    expect(await refused(() => insertSheet({ status: 'FINISHED', date: '2026-10-09' }))).toBe(true)
  })
})

describe('one register per section, subject, date and period', () => {
  it('refuses a duplicate subject-wise sheet', async () => {
    await insertSheet({ subject: ID.biology, date: '2026-11-01' })
    expect(
      await refused(() => insertSheet({ subject: ID.biology, date: '2026-11-01' })),
    ).toBe(true)
  })

  it('refuses a duplicate DAILY sheet, even though subject_id is NULL', async () => {
    // This is the NULLS NOT DISTINCT rule. Without it PostgreSQL treats each
    // NULL as unique and this second insert would succeed.
    await insertSheet({ subject: null, date: '2026-11-02' })
    expect(await refused(() => insertSheet({ subject: null, date: '2026-11-02' }))).toBe(true)
  })

  it('allows a daily sheet and a subject sheet on the same day', async () => {
    await insertSheet({ subject: null, date: '2026-11-03' })
    await expect(insertSheet({ subject: ID.biology, date: '2026-11-03' })).resolves.toBeTruthy()
  })

  it('allows two different subjects on the same day', async () => {
    await insertSheet({ subject: ID.biology, date: '2026-11-04' })
    await expect(insertSheet({ subject: ID.chemistry, date: '2026-11-04' })).resolves.toBeTruthy()
  })

  it('allows the same subject twice on one day in different periods', async () => {
    await insertSheet({ subject: ID.biology, date: '2026-11-05', period: 1 })
    await expect(
      insertSheet({ subject: ID.biology, date: '2026-11-05', period: 2 }),
    ).resolves.toBeTruthy()
  })

  it('allows the same subject on different days', async () => {
    await insertSheet({ subject: ID.biology, date: '2026-11-06' })
    await expect(insertSheet({ subject: ID.biology, date: '2026-11-07' })).resolves.toBeTruthy()
  })

  it('allows two sections to hold the same subject on the same day', async () => {
    await insertSheet({ subject: ID.biology, date: '2026-11-08' })
    await expect(
      insertSheet({
        subject: ID.biology,
        date: '2026-11-08',
        section: ID.otherSection,
        session: ID.otherSession,
      }),
    ).resolves.toBeTruthy()
  })
})

describe('a sheet cannot mix a section with the wrong academic session', () => {
  it('refuses a section that belongs to a different session', async () => {
    // The composite foreign key (section_id, academic_session_id) makes this
    // structurally impossible rather than merely discouraged.
    expect(
      await refused(() =>
        insertSheet({ section: ID.otherSection, session: ID.session, date: '2026-12-01' }),
      ),
    ).toBe(true)
  })

  it('refuses a section that does not exist at all', async () => {
    expect(
      await refused(() =>
        insertSheet({ section: '00000000-0000-0000-0000-000000000000', date: '2026-12-02' }),
      ),
    ).toBe(true)
  })
})

describe('attendance entries', () => {
  it('accepts one entry per student', async () => {
    const sheet = await insertSheet({ date: '2027-01-01' })
    await expect(insertEntry(sheet, { student: ID.student })).resolves.toBeTruthy()
    await expect(insertEntry(sheet, { student: ID.student2 })).resolves.toBeTruthy()
  })

  it('refuses the same student twice on one sheet', async () => {
    const sheet = await insertSheet({ date: '2027-01-02' })
    await insertEntry(sheet, { student: ID.student })
    expect(await refused(() => insertEntry(sheet, { student: ID.student }))).toBe(true)
  })

  it('accepts the same student on two different sheets', async () => {
    const a = await insertSheet({ subject: ID.biology, date: '2027-01-03' })
    const b = await insertSheet({ subject: ID.chemistry, date: '2027-01-03' })
    await insertEntry(a)
    await expect(insertEntry(b)).resolves.toBeTruthy()
  })

  it('accepts every attendance status', async () => {
    const sheet = await insertSheet({ date: '2027-01-04' })
    const students = [ID.student, ID.student2]
    for (const [i, status] of ['PRESENT', 'ABSENT'].entries()) {
      await expect(insertEntry(sheet, { student: students[i], status })).resolves.toBeTruthy()
    }
    const other = await insertSheet({ subject: ID.chemistry, date: '2027-01-04' })
    for (const [i, status] of ['LATE', 'LEAVE'].entries()) {
      await expect(insertEntry(other, { student: students[i], status })).resolves.toBeTruthy()
    }
  })

  it('refuses a status that is not in the enum', async () => {
    const sheet = await insertSheet({ date: '2027-01-05' })
    expect(await refused(() => insertEntry(sheet, { status: 'EXCUSED' }))).toBe(true)
    expect(await refused(() => insertEntry(sheet, { status: 'present' }))).toBe(true)
  })

  it('refuses an entry whose session disagrees with its sheet', async () => {
    // The composite foreign key (sheet_id, academic_session_id) means the
    // denormalised session on an entry can never drift from its sheet.
    const sheet = await insertSheet({ date: '2027-01-06' })
    expect(await refused(() => insertEntry(sheet, { session: ID.otherSession }))).toBe(true)
  })

  it('refuses an entry for a student who does not exist', async () => {
    const sheet = await insertSheet({ date: '2027-01-07' })
    expect(
      await refused(() =>
        insertEntry(sheet, { student: '00000000-0000-0000-0000-000000000000' }),
      ),
    ).toBe(true)
  })

  it('refuses an entry with no sheet', async () => {
    expect(
      await refused(() => insertEntry('00000000-0000-0000-0000-000000000000')),
    ).toBe(true)
  })
})

describe('history is protected', () => {
  it('refuses to delete a student who has attendance', async () => {
    const sheet = await insertSheet({ date: '2027-02-01' })
    await insertEntry(sheet, { student: ID.student2 })
    expect(
      await refused(() => db.query(`DELETE FROM students WHERE id = $1`, [ID.student2])),
    ).toBe(true)
  })

  it('refuses to delete a subject that has been taught', async () => {
    // ON DELETE RESTRICT, not SET NULL: a NULL subject means "daily roll-call",
    // so nulling it would silently rewrite subject-wise history as daily.
    await insertSheet({ subject: ID.chemistry, date: '2027-02-02' })
    expect(
      await refused(() => db.query(`DELETE FROM subjects WHERE id = $1`, [ID.chemistry])),
    ).toBe(true)
  })

  it('refuses to delete the staff member who marked a register', async () => {
    await insertSheet({ date: '2027-02-03' })
    expect(await refused(() => db.query(`DELETE FROM staff WHERE id = $1`, [ID.staff]))).toBe(true)
  })

  it('cancelling a sheet keeps its entries', async () => {
    const sheet = await insertSheet({ date: '2027-02-04' })
    await insertEntry(sheet)
    await db.query(
      `UPDATE attendance_sheets SET status = 'CANCELLED', cancelled_reason = $2 WHERE id = $1`,
      [sheet, 'Public holiday'],
    )
    const entries = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM attendance_entries WHERE sheet_id = $1`,
      [sheet],
    )
    expect(entries.rows[0]?.n).toBe(1)
  })
})

describe('the indexes the reports will rely on exist', () => {
  it('has every index the design calls for', async () => {
    const result = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename IN ('attendance_sheets', 'attendance_entries')`,
    )
    const names = result.rows.map((r) => r.indexname)

    for (const expected of [
      'attendance_sheets_section_id_date_idx',
      'attendance_sheets_academic_session_id_date_idx',
      'attendance_sheets_marked_by_staff_id_date_idx',
      'attendance_sheets_section_id_subject_id_date_period_key',
      'attendance_entries_student_id_academic_session_id_date_idx',
      'attendance_entries_sheet_id_student_id_key',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('keeps the daily-sheet index as NULLS NOT DISTINCT', async () => {
    // Guards the hand-written SQL: if a future migration recreated this index
    // the Prisma way, duplicate daily registers would silently become possible.
    const result = await db.query<{ def: string }>(
      `SELECT indexdef AS def FROM pg_indexes
        WHERE indexname = 'attendance_sheets_section_id_subject_id_date_period_key'`,
    )
    expect(result.rows[0]?.def).toContain('NULLS NOT DISTINCT')
  })
})

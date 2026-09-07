import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The notices and events schema, tested against a real PostgreSQL.
 *
 * These check what the *database* refuses, by applying every migration in
 * order to a throwaway instance and then trying to break each rule. Most of
 * them are hand-written SQL that Prisma cannot express -- the NULLS NOT
 * DISTINCT target uniqueness, the audience-matches-columns CHECK, the window
 * CHECKs and the widened document owner rule -- so without a test nothing
 * would notice if a future migration dropped one.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

let db: PGlite

const ID = {
  session: '11111111-1111-4111-8111-111111111111',
  class: '22222222-2222-4222-8222-222222222221',
  division: '22222222-2222-4222-8222-222222222222',
  program: '22222222-2222-4222-8222-222222222223',
  group: '33333333-3333-4333-8333-333333333331',
  section: '44444444-4444-4444-8444-444444444441',
  designation: '77777777-7777-4777-8777-777777777771',
  staff: '88888888-8888-4888-8888-888888888881',
  student: '66666666-6666-4666-8666-666666666661',
  user: '99999999-9999-4999-8999-999999999991',
  noticeType: 'NOTICE_ATTACHMENT',
  eventType: 'EVENT_IMAGE',
  photoType: 'STUDENT_PHOTO',
}

let counter = 0
function uid(): string {
  counter += 1
  return `aaaaaaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

const rejects = async (fn: () => Promise<unknown>, pattern?: RegExp) => {
  if (pattern) await expect(fn()).rejects.toThrow(pattern)
  else await expect(fn()).rejects.toThrow()
}

beforeAll(async () => {
  db = await PGlite.create()

  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!/^\d{14}_/.test(dir)) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
    await db.exec(sql)
  }

  await db.exec(`
    INSERT INTO academic_sessions (id, name, start_date, end_date, is_current, status, created_at, updated_at)
      VALUES ('${ID.session}', '2026-27', '2026-04-01', '2027-03-31', true, 'ACTIVE', now(), now());
    INSERT INTO classes (id, name, code, level, is_active, created_at, updated_at)
      VALUES ('${ID.class}', '1st Year', '11', 1, true, now(), now());
    INSERT INTO divisions (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.division}', 'Boys', 'B', 1, true, now(), now());
    INSERT INTO programs (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.program}', 'Pre-Medical', 'PM', 1, true, now(), now());
    INSERT INTO academic_groups (id, academic_session_id, class_id, division_id, program_id, is_active, created_at, updated_at)
      VALUES ('${ID.group}', '${ID.session}', '${ID.class}', '${ID.division}', '${ID.program}', true, now(), now());
    INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at)
      VALUES ('${ID.section}', '${ID.group}', '${ID.session}', 'A', true, now(), now());
    INSERT INTO designations (id, name, code, is_active, sort_order, created_at, updated_at)
      VALUES ('${ID.designation}', 'Lecturer', 'LEC', true, 1, now(), now());
    INSERT INTO staff (id, staff_code, full_name, designation_id, staff_type, employment_status, joining_date, created_at, updated_at)
      VALUES ('${ID.staff}', 'STF-0001', 'Sara Khan', '${ID.designation}', 'TEACHING', 'ACTIVE', '2026-04-01', now(), now());
    INSERT INTO students (id, student_code, admission_number, full_name, father_name, gender, admission_date, admission_session_id, status, created_at, updated_at)
      VALUES ('${ID.student}', 'STU-0001', 'ADM-00001', 'Ali Raza', 'Raza Khan', 'MALE', '2026-04-01', '${ID.session}', 'ACTIVE', now(), now());
    INSERT INTO users (id, username, password_hash, role, status, must_change_password, failed_login_attempts, is_system_owner, created_at, updated_at)
      VALUES ('${ID.user}', 'admin', 'x', 'ADMIN', 'ACTIVE', false, 0, true, now(), now());
    INSERT INTO document_types (key, label, owner_type, is_required, is_sensitive, allowed_mime_types, max_size_bytes, sort_order, is_active, created_at, updated_at) VALUES
      ('${ID.photoType}', 'Photograph', 'STUDENT', true, false, '{image/jpeg}', 1000000, 1, true, now(), now()),
      ('${ID.noticeType}', 'Notice attachment', 'NOTICE', false, false, '{application/pdf}', 1000000, 1, true, now(), now()),
      ('${ID.eventType}', 'Event image', 'EVENT', false, false, '{image/jpeg}', 1000000, 1, true, now(), now());
  `)
}, 60_000)

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function insertNotice(over: { publishAt?: string; expiresAt?: string | null; status?: string } = {}) {
  const id = uid()
  await db.query(
    `INSERT INTO notices (id, title, body, category, status, publish_at, expires_at, is_pinned, created_at, updated_at)
     VALUES ($1, 'Title', 'Body', 'GENERAL', $2, $3, $4, false, now(), now())`,
    [id, over.status ?? 'PUBLISHED', over.publishAt ?? '2026-09-07T08:00:00Z', over.expiresAt ?? null],
  )
  return id
}

interface Target {
  audience: string
  classId?: string | null
  divisionId?: string | null
  programId?: string | null
  academicGroupId?: string | null
  sectionId?: string | null
}

async function insertTarget(noticeId: string, t: Target) {
  const id = uid()
  await db.query(
    `INSERT INTO notice_targets (id, notice_id, audience, class_id, division_id, program_id, academic_group_id, section_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, noticeId, t.audience, t.classId ?? null, t.divisionId ?? null, t.programId ?? null, t.academicGroupId ?? null, t.sectionId ?? null],
  )
  return id
}

async function insertEvent(over: { startsAt?: string; endsAt?: string | null; audience?: string; status?: string } = {}) {
  const id = uid()
  await db.query(
    `INSERT INTO events (id, title, starts_at, ends_at, audience, status, created_at, updated_at)
     VALUES ($1, 'Sports day', $2, $3, $4, $5, now(), now())`,
    [id, over.startsAt ?? '2026-10-01T09:00:00Z', over.endsAt ?? null, over.audience ?? 'ALL', over.status ?? 'DRAFT'],
  )
  return id
}

async function insertDocument(owner: {
  studentId?: string | null
  staffId?: string | null
  noticeId?: string | null
  eventId?: string | null
  typeKey?: string
}) {
  const id = uid()
  await db.query(
    `INSERT INTO documents (id, document_type_key, student_id, staff_id, notice_id, event_id, storage_provider, storage_file_id,
        file_name, original_file_name, mime_type, file_size_bytes, checksum_sha256, status, uploaded_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'google_drive', $7, 'f.pdf', 'f.pdf', 'application/pdf', 10, repeat('a', 64), 'ACTIVE', $8, now(), now())`,
    [id, owner.typeKey ?? ID.noticeType, owner.studentId ?? null, owner.staffId ?? null, owner.noticeId ?? null, owner.eventId ?? null, `file-${id}`, ID.user],
  )
  return id
}

/* -------------------------------------------------------------------------- */

describe('the migration applies on top of the existing history', () => {
  it('creates the three tables', async () => {
    const r = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('notices', 'notice_targets', 'events') ORDER BY table_name`,
    )
    expect(r.rows.map((x) => x.table_name)).toEqual(['events', 'notice_targets', 'notices'])
  })

  it('creates the four enums with the values the plan names', async () => {
    const values = async (type: string) =>
      (
        await db.query<{ label: string }>(
          `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = $1 ORDER BY e.enumsortorder`,
          [type],
        )
      ).rows.map((x) => x.label)
    expect(await values('audience')).toEqual(['ALL', 'STUDENTS', 'STAFF', 'CLASS', 'DIVISION', 'PROGRAM', 'GROUP', 'SECTION'])
    expect(await values('notice_category')).toEqual(['GENERAL', 'ACADEMIC', 'EXAM', 'EVENT', 'EMERGENCY', 'HOLIDAY'])
    expect(await values('publish_status')).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
    expect(await values('event_status')).toEqual(['DRAFT', 'PUBLISHED', 'CANCELLED'])
  })

  it('gives documents a notice_id and an event_id', async () => {
    const r = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'documents' AND column_name IN ('notice_id', 'event_id') ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual(['event_id', 'notice_id'])
  })
})

/* -------------------------------------------------------------------------- */

describe('a notice cannot carry the same target twice', () => {
  it('refuses ALL added a second time -- the NULLS NOT DISTINCT case', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'ALL' })
    await rejects(() => insertTarget(notice, { audience: 'ALL' }), /notice_targets_one_per_notice_key/)
  })

  it('refuses the same section twice, and allows two different sections', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'SECTION', sectionId: ID.section })
    await rejects(() => insertTarget(notice, { audience: 'SECTION', sectionId: ID.section }))
    // A second, different section is a second target, not a duplicate.
    const other = uid()
    await db.query(
      `INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'B', true, now(), now())`,
      [other, ID.group, ID.session],
    )
    await insertTarget(notice, { audience: 'SECTION', sectionId: other })
  })

  it('allows the same target on two different notices', async () => {
    const a = await insertNotice()
    const b = await insertNotice()
    await insertTarget(a, { audience: 'STUDENTS' })
    await insertTarget(b, { audience: 'STUDENTS' })
  })
})

describe('a target names exactly what its audience needs', () => {
  it('accepts the population audiences with no id', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'ALL' })
    await insertTarget(notice, { audience: 'STUDENTS' })
    await insertTarget(notice, { audience: 'STAFF' })
  })

  it('refuses a population audience carrying an id', async () => {
    const notice = await insertNotice()
    await rejects(
      () => insertTarget(notice, { audience: 'ALL', sectionId: ID.section }),
      /notice_targets_audience_matches_columns/,
    )
  })

  it('accepts each structural audience with its own id', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'CLASS', classId: ID.class })
    await insertTarget(notice, { audience: 'DIVISION', divisionId: ID.division })
    await insertTarget(notice, { audience: 'PROGRAM', programId: ID.program })
    await insertTarget(notice, { audience: 'GROUP', academicGroupId: ID.group })
    await insertTarget(notice, { audience: 'SECTION', sectionId: ID.section })
  })

  it('refuses a structural audience with its id missing', async () => {
    const notice = await insertNotice()
    await rejects(() => insertTarget(notice, { audience: 'SECTION' }), /audience_matches_columns/)
    await rejects(() => insertTarget(notice, { audience: 'CLASS' }), /audience_matches_columns/)
  })

  it('refuses a structural audience carrying somebody else’s id as well', async () => {
    const notice = await insertNotice()
    await rejects(
      () => insertTarget(notice, { audience: 'CLASS', classId: ID.class, sectionId: ID.section }),
      /audience_matches_columns/,
    )
    await rejects(
      () => insertTarget(notice, { audience: 'SECTION', sectionId: ID.section, classId: ID.class }),
      /audience_matches_columns/,
    )
  })

  it('refuses a target whose section does not exist', async () => {
    const notice = await insertNotice()
    await rejects(() => insertTarget(notice, { audience: 'SECTION', sectionId: uid() }))
  })
})

describe('a target goes with its notice', () => {
  it('is deleted when the notice is deleted', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'ALL' })
    await db.query(`DELETE FROM notices WHERE id = $1`, [notice])
    const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM notice_targets WHERE notice_id = $1`, [notice])
    expect(r.rows[0]?.n).toBe('0')
  })

  it('stops a class being deleted while a notice names it', async () => {
    const notice = await insertNotice()
    await insertTarget(notice, { audience: 'CLASS', classId: ID.class })
    await rejects(() => db.query(`DELETE FROM classes WHERE id = $1`, [ID.class]))
  })
})

/* -------------------------------------------------------------------------- */

describe('the publish window', () => {
  it('allows no expiry, and an expiry after publication', async () => {
    await insertNotice({ expiresAt: null })
    await insertNotice({ publishAt: '2026-09-07T08:00:00Z', expiresAt: '2026-09-08T08:00:00Z' })
  })

  it('refuses an expiry at or before publication', async () => {
    await rejects(
      () => insertNotice({ publishAt: '2026-09-07T08:00:00Z', expiresAt: '2026-09-07T08:00:00Z' }),
      /notices_expiry_after_publish/,
    )
    await rejects(
      () => insertNotice({ publishAt: '2026-09-07T08:00:00Z', expiresAt: '2026-09-06T08:00:00Z' }),
      /notices_expiry_after_publish/,
    )
  })

  it('defaults a new notice to DRAFT and to publishing now', async () => {
    const id = uid()
    await db.query(
      `INSERT INTO notices (id, title, body, created_at, updated_at) VALUES ($1, 'T', 'B', now(), now())`,
      [id],
    )
    const r = await db.query<{ status: string; ok: boolean }>(
      `SELECT status, publish_at <= now() AS ok FROM notices WHERE id = $1`,
      [id],
    )
    expect(r.rows[0]).toEqual({ status: 'DRAFT', ok: true })
  })
})

/* -------------------------------------------------------------------------- */

describe('events', () => {
  it('are for a whole population only', async () => {
    await insertEvent({ audience: 'ALL' })
    await insertEvent({ audience: 'STUDENTS' })
    await insertEvent({ audience: 'STAFF' })
    await rejects(() => insertEvent({ audience: 'SECTION' }), /events_audience_is_population/)
    await rejects(() => insertEvent({ audience: 'CLASS' }), /events_audience_is_population/)
  })

  it('cannot end before they start, but may end when they start', async () => {
    await insertEvent({ startsAt: '2026-10-01T09:00:00Z', endsAt: '2026-10-01T09:00:00Z' })
    await insertEvent({ startsAt: '2026-10-01T09:00:00Z', endsAt: '2026-10-01T12:00:00Z' })
    await rejects(
      () => insertEvent({ startsAt: '2026-10-01T09:00:00Z', endsAt: '2026-10-01T08:59:59Z' }),
      /events_end_after_start/,
    )
  })

  it('may point at a cover picture, and lose it when the picture is deleted', async () => {
    const event = await insertEvent()
    const cover = await insertDocument({ eventId: event, typeKey: ID.eventType })
    await db.query(`UPDATE events SET cover_document_id = $1 WHERE id = $2`, [cover, event])
    await db.query(`DELETE FROM documents WHERE id = $1`, [cover])
    const r = await db.query<{ cover: string | null }>(`SELECT cover_document_id AS cover FROM events WHERE id = $1`, [event])
    expect(r.rows[0]?.cover).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('a document has at most one owner', () => {
  it('may belong to a notice, or to an event', async () => {
    const notice = await insertNotice()
    const event = await insertEvent()
    await insertDocument({ noticeId: notice })
    await insertDocument({ eventId: event, typeKey: ID.eventType })
  })

  it('still may belong to a student, exactly as before', async () => {
    await insertDocument({ studentId: ID.student, typeKey: ID.photoType })
  })

  it('may belong to nobody -- the COLLEGE case the enum has allowed for since Phase 6', async () => {
    await insertDocument({})
  })

  it('cannot belong to two owners', async () => {
    const notice = await insertNotice()
    const event = await insertEvent()
    await rejects(() => insertDocument({ noticeId: notice, eventId: event }), /documents_at_most_one_owner/)
    await rejects(() => insertDocument({ noticeId: notice, studentId: ID.student }), /documents_at_most_one_owner/)
    await rejects(() => insertDocument({ studentId: ID.student, staffId: ID.staff }), /documents_at_most_one_owner/)
  })

  it('no longer carries the old exactly-one rule', async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_constraint WHERE conname = 'documents_exactly_one_owner'`,
    )
    expect(r.rows[0]?.n).toBe('0')
  })

  it('goes with its notice when the notice is deleted', async () => {
    const notice = await insertNotice()
    const doc = await insertDocument({ noticeId: notice })
    await db.query(`DELETE FROM notices WHERE id = $1`, [notice])
    const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM documents WHERE id = $1`, [doc])
    expect(r.rows[0]?.n).toBe('0')
  })
})

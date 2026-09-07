/**
 * Seed the THROWAWAY database for the Phase 10 Step 4 verification.
 *
 *   node seed.mjs --migrate   apply every migration, in order
 *   node seed.mjs --data      the smallest dataset that proves teacher scope
 *
 * Never pointed at Neon: the connection string is hard-wired to the PGlite
 * socket on 127.0.0.1:55432.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(PROJECT, 'package.json'))
const pg = require('pg')
const { hash } = require('@node-rs/argon2')

const DB_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable'
const client = new pg.Client({ connectionString: DB_URL })
await client.connect()

const mode = process.argv[2]

if (mode === '--migrate') {
  // Neon's session time zone is GMT, so a zone-less timestamp parameter is
  // read as UTC there. PGlite inherits this machine's zone (+05:00) unless told
  // otherwise, which would shift every timestamptz comparison by five hours.
  await client.query("ALTER DATABASE postgres SET timezone TO 'UTC'")
  const dir = join(PROJECT, 'prisma', 'migrations')
  for (const name of readdirSync(dir).sort()) {
    if (!name.match(/^\d{14}_/)) continue
    const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8')
    await client.query(sql)
    console.log('  applied', name)
  }
  await client.end()
  process.exit(0)
}

/* -------------------------------------------------------------------------- */

const ID = {
  session: '11111111-1111-4111-8111-111111111111',
  otherSession: '11111111-1111-4111-8111-111111111112',
  class11: '22222222-2222-4222-8222-222222222211',
  class12: '22222222-2222-4222-8222-222222222212',
  division: '22222222-2222-4222-8222-222222222222',
  program: '22222222-2222-4222-8222-222222222223',
  group11: '33333333-3333-4333-8333-333333333311',
  group12: '33333333-3333-4333-8333-333333333312',
  groupOther: '33333333-3333-4333-8333-333333333399',
  sec11A: '44444444-4444-4444-8444-444444444411',
  sec11B: '44444444-4444-4444-8444-444444444412',
  sec12B: '44444444-4444-4444-8444-444444444422',
  secOther: '44444444-4444-4444-8444-444444444499',
  biology: '55555555-5555-4555-8555-555555555551',
  chemistry: '55555555-5555-4555-8555-555555555552',
  staffA: '88888888-8888-4888-8888-888888888881',
  staffB: '88888888-8888-4888-8888-888888888882',
  student: '66666666-6666-4666-8666-666666666661',
  userAdmin: '99999999-9999-4999-8999-999999999901',
  userA: '99999999-9999-4999-8999-999999999902',
  userB: '99999999-9999-4999-8999-999999999903',
  userStudent: '99999999-9999-4999-8999-999999999904',
  userUnlinked: '99999999-9999-4999-8999-999999999905',
}

let n = 0
const uid = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`

/** Today, as the college counts it, so the "today" lessons land on today. */
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Karachi' })
  .format(new Date())
  .toUpperCase()
const otherDay = weekday === 'TUESDAY' ? 'WEDNESDAY' : 'TUESDAY'

const PASSWORD = 'Harness-Passw0rd!'
const passwordHash = await hash(PASSWORD, {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
})

const designation = (await client.query(`SELECT id FROM designations ORDER BY sort_order LIMIT 1`))
  .rows[0]?.id
if (!designation) throw new Error('reference seed has not run: no designations')

const one = (sql, params) => client.query(sql, params)
await one(`INSERT INTO academic_sessions (id, name, start_date, end_date, is_current, status, created_at, updated_at) VALUES
    ($1, '2026-27', '2026-04-01', '2027-03-31', true, 'ACTIVE', now(), now()),
    ($2, '2027-28', '2027-04-01', '2028-03-31', false, 'UPCOMING', now(), now())`, [ID.session, ID.otherSession])
// The reference seed already holds the college's real building blocks; reuse
// them where they exist so the harness looks like the college, not a fixture.
async function ensure(table, where, insertSql, params) {
  const found = await client.query(`SELECT id FROM ${table} WHERE ${where}`, params.slice(0, 1))
  if (found.rows[0]) return found.rows[0].id
  await client.query(insertSql, params)
  return params[params.length - 1]
}
ID.class11 = await ensure('classes', 'name = $1',
  `INSERT INTO classes (name, code, level, is_active, created_at, updated_at, id) VALUES ($1, 'H11', 1, true, now(), now(), $2)`, ['1st Year', ID.class11])
ID.class12 = await ensure('classes', 'name = $1',
  `INSERT INTO classes (name, code, level, is_active, created_at, updated_at, id) VALUES ($1, 'H12', 2, true, now(), now(), $2)`, ['2nd Year', ID.class12])
ID.division = await ensure('divisions', 'name = $1',
  `INSERT INTO divisions (name, code, sort_order, is_active, created_at, updated_at, id) VALUES ($1, 'HB', 1, true, now(), now(), $2)`, ['Boys', ID.division])
ID.program = await ensure('programs', 'name = $1',
  `INSERT INTO programs (name, code, sort_order, is_active, created_at, updated_at, id) VALUES ($1, 'HPM', 1, true, now(), now(), $2)`, ['Pre-Medical', ID.program])
ID.biology = await ensure('subjects', 'name = $1',
  `INSERT INTO subjects (name, code, is_active, created_at, updated_at, id) VALUES ($1, 'HBIO', true, now(), now(), $2)`, ['Biology', ID.biology])
ID.chemistry = await ensure('subjects', 'name = $1',
  `INSERT INTO subjects (name, code, is_active, created_at, updated_at, id) VALUES ($1, 'HCHEM', true, now(), now(), $2)`, ['Chemistry', ID.chemistry])

await one(`INSERT INTO academic_groups (id, academic_session_id, class_id, division_id, program_id, is_active, created_at, updated_at) VALUES
    ($1, $4, $6, $8, $9, true, now(), now()),
    ($2, $4, $7, $8, $9, true, now(), now()),
    ($3, $5, $6, $8, $9, true, now(), now())`,
  [ID.group11, ID.group12, ID.groupOther, ID.session, ID.otherSession, ID.class11, ID.class12, ID.division, ID.program])
await one(`INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at) VALUES
    ($1, $5, $7, 'A', true, now(), now()),
    ($2, $5, $7, 'B', true, now(), now()),
    ($3, $6, $7, 'B', true, now(), now()),
    ($4, $9, $8, 'A', true, now(), now())`,
  [ID.sec11A, ID.sec11B, ID.sec12B, ID.secOther, ID.group11, ID.group12, ID.session, ID.otherSession, ID.groupOther])

// Curriculum: both classes study Biology and Chemistry on this programme.
for (const classId of [ID.class11, ID.class12]) {
  for (const [subjectId, order] of [[ID.biology, 1], [ID.chemistry, 2]]) {
    await client.query(
      `INSERT INTO curriculum_subjects (id, academic_session_id, class_id, program_id, subject_id, is_compulsory, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, now(), now())`,
      [uid(), ID.session, classId, ID.program, subjectId, order],
    )
  }
}

// Accounts.
const users = [
  [ID.userAdmin, 'harness.admin', 'ADMIN'],
  [ID.userA, 'harness.teacher.a', 'STAFF'],
  [ID.userB, 'harness.teacher.b', 'STAFF'],
  [ID.userStudent, 'harness.student', 'STUDENT'],
  [ID.userUnlinked, 'harness.unlinked', 'STAFF'],
]
for (const [id, username, role] of users) {
  await client.query(
    `INSERT INTO users (id, username, password_hash, role, status, must_change_password, failed_login_attempts, is_system_owner, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', false, 0, false, now(), now())`,
    [id, username, passwordHash, role],
  )
}

await client.query(
  `INSERT INTO staff (id, staff_code, full_name, designation_id, staff_type, employment_status, joining_date, user_id, created_at, updated_at) VALUES
     ($1, 'HSTF-0001', 'Sara Khan',  $3, 'TEACHING', 'ACTIVE', '2026-04-01', $4, now(), now()),
     ($2, 'HSTF-0002', 'Imran Ali',  $3, 'TEACHING', 'ACTIVE', '2026-04-01', $5, now(), now())`,
  [ID.staffA, ID.staffB, designation, ID.userA, ID.userB],
)

await client.query(
  `INSERT INTO students (id, student_code, admission_number, full_name, father_name, gender, admission_date, admission_session_id, status, user_id, created_at, updated_at)
   VALUES ($1, 'HSTU-0001', 'HADM-00001', 'Ali Raza', 'Raza Khan', 'MALE', '2026-04-01', $2, 'ACTIVE', $3, now(), now())`,
  [ID.student, ID.session, ID.userStudent],
)
await client.query(
  `INSERT INTO student_enrollments (id, student_id, academic_session_id, section_id, roll_number, status, start_date, created_at, updated_at)
   VALUES ($1, $2, $3, $4, '1', 'ACTIVE', '2026-04-01', now(), now())`,
  [uid(), ID.student, ID.session, ID.sec11A],
)

// TeacherAssignment stays the authority: A teaches Biology in 11A and 12B,
// B teaches Chemistry in 11B.
const assignments = [
  [ID.staffA, ID.sec11A, ID.biology],
  [ID.staffA, ID.sec12B, ID.biology],
  [ID.staffB, ID.sec11B, ID.chemistry],
]
for (const [staff, section, subject] of assignments) {
  await client.query(
    `INSERT INTO teacher_assignments (id, staff_id, section_id, subject_id, academic_session_id, is_active, assigned_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, '2026-04-01', now(), now())`,
    [uid(), staff, section, subject, ID.session],
  )
}

// The timetable itself. Teacher A: Class 11 / A / Biology / period 2 and
// Class 12 / B / Biology / period 4 -- both on today's weekday so the
// dashboard has something to show. A decoy for A on another day, and one
// lesson for B today.
const slots = [
  ['slotA1', ID.sec11A, ID.biology, ID.staffA, weekday, 2, 'Lab 1'],
  ['slotA2', ID.sec12B, ID.biology, ID.staffA, weekday, 4, null],
  ['slotA3', ID.sec11A, ID.biology, ID.staffA, otherDay, 7, 'Lab 1'],
  ['slotB1', ID.sec11B, ID.chemistry, ID.staffB, weekday, 3, 'Lab 2'],
]
const slotIds = {}
for (const [key, section, subject, staff, day, period, room] of slots) {
  const id = uid()
  slotIds[key] = id
  await client.query(
    `INSERT INTO timetable_slots (id, section_id, academic_session_id, subject_id, staff_id, day_of_week, period, room, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now())`,
    [id, section, ID.session, subject, staff, day, period, room],
  )
}

writeFileSync(
  new URL('./ids.json', import.meta.url),
  JSON.stringify({ ...ID, slots: slotIds, weekday, otherDay, password: PASSWORD }, null, 2),
)

const counts = await client.query(
  `SELECT (SELECT count(*) FROM timetable_slots) AS slots, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM role_permissions) AS grants`,
)
console.log('  seeded:', counts.rows[0], 'today =', weekday)
await client.end()

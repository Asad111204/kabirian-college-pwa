/**
 * Load fixtures for the THROWAWAY database: 5,000 students in 100 sections of
 * 50, 500 of them with a login. Runs after seed.mjs --data; never pointed at
 * Neon. Rows are inserted 500 at a time so the seed takes seconds, not minutes.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(PROJECT, 'package.json'))
const pg = require('pg')
const { hash } = require('@node-rs/argon2')

const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const client = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable' })
await client.connect()

const STUDENTS = 5000
const PER_SECTION = 50
const WITH_LOGIN = 500

let n = 0
const uid = (prefix) => `${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`
const FIRST = ['Ali', 'Ahmed', 'Bilal', 'Hamza', 'Usman', 'Zain', 'Ayesha', 'Fatima', 'Hira', 'Maryam', 'Sana', 'Zara', 'Omar', 'Yusuf', 'Ibrahim', 'Noor']
const LAST = ['Khan', 'Raza', 'Malik', 'Butt', 'Sheikh', 'Qureshi', 'Chaudhry', 'Awan', 'Baig', 'Mirza']
const name = (i) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`

const started = Date.now()
const passwordHash = await hash(ids.password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 })

// 100 sections: L01..L50 under the 1st-year group, L51..L100 under the 2nd-year group.
const sections = []
{
  const rows = []
  const params = []
  for (let i = 1; i <= STUDENTS / PER_SECTION; i++) {
    const id = uid('cccccccc')
    const group = i <= 50 ? ids.group11 : ids.group12
    sections.push(id)
    const base = params.length
    rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, true, now(), now())`)
    params.push(id, group, ids.session, `L${String(i).padStart(2, '0')}`)
  }
  await client.query(`INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at) VALUES ${rows.join(',')}`, params)
}

// Students and enrolments, 500 per statement.
const studentIds = []
for (let batch = 0; batch < STUDENTS; batch += 500) {
  const sRows = []
  const sParams = []
  const eRows = []
  const eParams = []
  for (let i = batch; i < batch + 500; i++) {
    const id = uid('dddddddd')
    studentIds.push(id)
    const b = sParams.length
    sRows.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, '2026-04-01', $${b + 7}, 'ACTIVE', now(), now())`)
    sParams.push(id, `LOAD-${String(i + 1).padStart(5, '0')}`, `LADM-${String(i + 1).padStart(5, '0')}`, name(i), `${LAST[(i * 7) % LAST.length]} Sahib`, i % 2 ? 'FEMALE' : 'MALE', ids.session)
    const e = eParams.length
    eRows.push(`($${e + 1}, $${e + 2}, $${e + 3}, $${e + 4}, $${e + 5}, 'ACTIVE', '2026-04-01', now(), now())`)
    eParams.push(uid('eeeeeeee'), id, ids.session, sections[Math.floor(i / PER_SECTION)], String((i % PER_SECTION) + 1))
  }
  await client.query(`INSERT INTO students (id, student_code, admission_number, full_name, father_name, gender, admission_date, admission_session_id, status, created_at, updated_at) VALUES ${sRows.join(',')}`, sParams)
  await client.query(`INSERT INTO student_enrollments (id, student_id, academic_session_id, section_id, roll_number, status, start_date, created_at, updated_at) VALUES ${eRows.join(',')}`, eParams)
}

// Logins for the first 500 students.
{
  const rows = []
  const params = []
  const userIds = []
  for (let i = 0; i < WITH_LOGIN; i++) {
    const id = uid('ffffffff')
    userIds.push(id)
    const b = params.length
    rows.push(`($${b + 1}, $${b + 2}, $${b + 3}, 'STUDENT', 'ACTIVE', false, 0, false, now(), now())`)
    params.push(id, `load.student.${i + 1}`, passwordHash)
  }
  await client.query(`INSERT INTO users (id, username, password_hash, role, status, must_change_password, failed_login_attempts, is_system_owner, created_at, updated_at) VALUES ${rows.join(',')}`, params)
  for (let i = 0; i < WITH_LOGIN; i += 100) {
    const cases = []
    const p = []
    for (let j = i; j < i + 100; j++) {
      cases.push(`WHEN $${p.length + 1}::uuid THEN $${p.length + 2}::uuid`)
      p.push(studentIds[j], userIds[j])
    }
    await client.query(`UPDATE students SET user_id = CASE id ${cases.join(' ')} END WHERE id IN (${p.filter((_, k) => k % 2 === 0).map((_, k) => `$${k * 2 + 1}`).join(',')})`, p)
  }
}

const counts = await client.query(`SELECT (SELECT count(*) FROM students) AS students, (SELECT count(*) FROM student_enrollments) AS enrollments, (SELECT count(*) FROM sections) AS sections, (SELECT count(*) FROM users) AS users`)
console.log('  load seeded:', counts.rows[0], `in ${((Date.now() - started) / 1000).toFixed(1)}s`)
writeFileSync(new URL('./ids-load.json', import.meta.url), JSON.stringify({ sections: sections.slice(0, 3), firstStudent: studentIds[0], loginUsername: 'load.student.1' }, null, 2))
await client.end()

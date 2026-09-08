/**
 * Exam fixtures for the THROWAWAY database: one exam type, one scheduled exam
 * with a marks-entry status, and one paper — Biology for 1st Year Pre-Medical,
 * which is exactly what teacher A is assigned to teach in section 11A.
 * Runs after seed.mjs --data. Never pointed at Neon.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(PROJECT, 'package.json'))
const pg = require('pg')

const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const client = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable' })
await client.connect()

let n = 200
const uid = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`

// An exam type of our own, so the reference seed's list is left alone.
const examTypeId = uid()
await client.query(
  `INSERT INTO exam_types (id, name, code, sort_order, is_active, created_at, updated_at)
   VALUES ($1, 'Harness Term', 'HTERM', 99, true, now(), now())`,
  [examTypeId],
)

// MARKS_ENTRY: the date sheet is out and marking is open, which is the state
// the deadline rules are about.
const examId = uid()
await client.query(
  `INSERT INTO exams (id, name, exam_type_id, academic_session_id, start_date, end_date, status, created_at, updated_at)
   VALUES ($1, 'Harness First Term', $2, $3, CURRENT_DATE - 7, CURRENT_DATE - 3, 'MARKS_ENTRY', now(), now())`,
  [examId, examTypeId, ids.session],
)

const paperId = uid()
await client.query(
  `INSERT INTO exam_papers (id, exam_id, academic_session_id, class_id, subject_id, program_id, exam_date, start_time, end_time, max_marks, passing_percentage, is_active, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE - 5, '09:00', '12:00', 100.00, 33.00, true, now(), now())`,
  [paperId, examId, ids.session, ids.class11, ids.biology, ids.program],
)

writeFileSync(new URL('./ids-exams.json', import.meta.url), JSON.stringify({ examTypeId, examId, paperId }, null, 2))
const counts = await client.query(`SELECT (SELECT count(*)::int FROM exams) AS exams, (SELECT count(*)::int FROM exam_papers) AS papers`)
console.log('  exam seeded:', counts.rows[0])
await client.end()

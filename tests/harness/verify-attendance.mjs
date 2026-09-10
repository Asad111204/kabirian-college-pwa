/**
 * Phase 18: a teacher corrects a submitted register within the window the
 * office sets, and cannot outside it. Through the PRODUCTION build.
 * Run by tests/harness/run.mjs.
 */
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))

let pass = 0
let fail = 0
const failures = []
const check = (label, ok, detail = '') => {
  if (ok) pass += 1
  else {
    fail += 1
    failures.push(label)
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`)
}

const jars = new Map()
async function login(who, username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ username, password: ids.password }),
    redirect: 'manual',
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie.startsWith('kc_session=')) throw new Error(`login failed for ${username}: ${res.status}`)
  jars.set(who, cookie)
}
async function call(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { origin: BASE, cookie: jars.get(who) ?? '', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* page */
  }
  return { status: res.status, text, data: json?.data, error: json?.error }
}
const get = (who, path) => call(who, 'GET', path)
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student')

console.log('\nThe attendance rules\n' + '-'.repeat(52))
let r = await get('admin', '/api/v1/settings/attendance')
check('the office reads the rules, with the defaults', r.status === 200 && r.data.teacherCorrectionDays === 7 && r.data.leaveCountsAsPresent === false, `${r.status} ${JSON.stringify(r.data)}`)
r = await get('teacherA', '/api/v1/settings/attendance')
check('a teacher cannot read them: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'PUT', '/api/v1/settings/attendance', { teacherCorrectionDays: 30, leaveCountsAsPresent: true })
check('nor change them: 403', r.status === 403, String(r.status))
r = await call('admin', 'PUT', '/api/v1/settings/attendance', { teacherCorrectionDays: 99, leaveCountsAsPresent: false })
check('more than the ceiling → 400', r.status === 400, String(r.status))
r = await call('admin', 'PUT', '/api/v1/settings/attendance', { teacherCorrectionDays: 3, leaveCountsAsPresent: false })
check('the office sets three days', r.status === 200 && r.data.teacherCorrectionDays === 3, `${r.status}`)
r = await get('admin', '/api/v1/audit?action=settings.updated')
check('…and it is in the audit log', r.status === 200 && r.data.total >= 1)
r = await get('admin', `/api/v1/audit/${r.data?.items?.[0]?.id}`)
check('with the old and new values', r.status === 200 && r.data.changes.some((c) => c.field === 'Teacher correction days' && c.before === '7' && c.after === '3'), JSON.stringify(r.data?.changes))

/*
 * The register belongs to the first period.
 *
 * The seed gives 11A one lesson today, teacher A in period 2, and 11B one
 * lesson today, teacher B in period 3. So teacher B has no claim on 11A's
 * register and every claim on 11B's — which is the whole rule, in two calls.
 */
console.log('\nThe register belongs to the first period\n' + '-'.repeat(52))

r = await call('teacherB', 'POST', '/api/v1/attendance/sheets', { sectionId: ids.sec11A, date: today })
check(
  'a teacher without that section’s first period is refused: 403',
  r.status === 403 && /first period/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message ?? r.text.slice(0, 160)}`,
)

r = await call('teacherB', 'POST', '/api/v1/attendance/sheets', { sectionId: ids.sec11B, date: today })
check(
  '…but may take the register for the section whose first period they do have',
  r.status === 201 || r.status === 200,
  `${r.status} ${r.error?.message ?? r.text.slice(0, 160)}`,
)
check(
  '…and it is a whole-day register, not a subject one',
  r.data?.subjectId === null || r.data?.subjectId === undefined,
  JSON.stringify(r.data?.subjectId ?? null),
)

// A subject and a period sent anyway are not honoured: the schema does not
// know them, so they are dropped rather than opening a second register.
r = await call('teacherB', 'POST', '/api/v1/attendance/sheets', {
  sectionId: ids.sec11B,
  date: today,
  subjectId: ids.chemistry,
  period: 6,
})
check(
  'a second register for the same section and day is refused, subject or no subject',
  r.status === 409 || r.status === 400,
  `${r.status} ${r.error?.message ?? ''}`,
)

console.log('\nA teacher corrects a submitted register\n' + '-'.repeat(52))
r = await call('teacherA', 'POST', '/api/v1/attendance/sheets', { sectionId: ids.sec11A, date: today })
check('teacher A, who has 11A’s first period, opens its register', r.status === 201 || r.status === 200, `${r.status} ${r.text.slice(0, 200)}`)
const sheetId = r.data?.id
r = await call('teacherA', 'POST', `/api/v1/attendance/sheets/${sheetId}/submit`)
check('…and submits it', r.status === 200 && r.data.status === 'SUBMITTED', `${r.status} ${r.text.slice(0, 200)}`)
r = await get('teacherA', `/api/v1/attendance/sheets/${sheetId}`)
check('the register says it can still be corrected, and until when', r.status === 200 && r.data.correction?.canEdit === true && typeof r.data.correction?.until === 'string', JSON.stringify(r.data?.correction))
r = await call('teacherA', 'PATCH', `/api/v1/attendance/sheets/${sheetId}`, { entries: [{ studentId: ids.student, status: 'ABSENT' }] })
check('teacher A corrects a mark on the submitted register', r.status === 200 && r.data.entries.some((e) => e.studentId === ids.student && e.status === 'ABSENT'), `${r.status} ${r.text.slice(0, 200)}`)
r = await get('admin', '/api/v1/audit?action=attendance.corrected')
check('the correction is audited under the teacher', r.status === 200 && r.data.items[0]?.actor?.username === 'harness.teacher.a', JSON.stringify(r.data?.items?.[0]?.actor))
r = await call('teacherB', 'PATCH', `/api/v1/attendance/sheets/${sheetId}`, { entries: [{ studentId: ids.student, status: 'PRESENT' }] })
check('teacher B, who does not have 11A’s first period, cannot: 403', r.status === 403, String(r.status))
r = await call('student', 'PATCH', `/api/v1/attendance/sheets/${sheetId}`, { entries: [{ studentId: ids.student, status: 'PRESENT' }] })
check('a student cannot: 403', r.status === 403, String(r.status))

r = await call('admin', 'PUT', '/api/v1/settings/attendance', { teacherCorrectionDays: 0, leaveCountsAsPresent: false })
check('the office closes the window (0 days)', r.status === 200)
r = await get('teacherA', `/api/v1/attendance/sheets/${sheetId}`)
check('the register now says only the office can correct it', r.status === 200 && r.data.correction?.canEdit === false && /office/i.test(r.data.correction?.reason ?? ''), JSON.stringify(r.data?.correction))
r = await call('teacherA', 'PATCH', `/api/v1/attendance/sheets/${sheetId}`, { entries: [{ studentId: ids.student, status: 'PRESENT' }] })
check('…and refuses the teacher with that sentence: 403', r.status === 403 && /office/i.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'PATCH', `/api/v1/attendance/sheets/${sheetId}`, { entries: [{ studentId: ids.student, status: 'PRESENT' }] })
check('the office still can', r.status === 200, String(r.status))
r = await call('admin', 'PUT', '/api/v1/settings/attendance', { teacherCorrectionDays: 7, leaveCountsAsPresent: false })
check('the window is put back to the default for the rest of the harness', r.status === 200)

r = await get('teacherA', '/staff/attendance')
check(
  'the staff attendance screen names the period the register rests on',
  r.status === 200 && /Your period 2/.test(r.text),
  String(r.status),
)
check(
  '…and offers no subject and no period to pick',
  r.status === 200 && !/<select/i.test(r.text),
  String(r.status),
)

r = await get('teacherA', `/staff/attendance/${sheetId}`)
check('the teacher’s register page renders the correction notice', r.status === 200 && /correct/i.test(r.text), String(r.status))
r = await get('admin', '/admin/settings')
check('the Settings page shows the attendance rules', r.status === 200 && r.text.includes('Attendance rules'), String(r.status))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

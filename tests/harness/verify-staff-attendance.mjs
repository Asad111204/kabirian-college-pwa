/**
 * Phase 22: staff attendance. The office marks a day, corrects it, sees the
 * month; a teacher sees their own record and nobody else's; the future is
 * refused. Through the PRODUCTION build. Run by tests/harness/run.mjs.
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
const plusDays = (n) => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student')
await login('unlinked', 'harness.unlinked')

console.log('\nToday’s register\n' + '-'.repeat(52))
let r = await get('admin', '/api/v1/staff-attendance')
check('the office opens today’s register with every staff member and nobody marked', r.status === 200 && r.data.date === today && r.data.rows.length === 2 && r.data.rows.every((x) => x.status === null) && r.data.editable === true, `${r.status} rows=${r.data?.rows?.length}`)
check('each row names the person and their designation, and carries their photo id field', r.data.rows.every((x) => x.fullName && x.designation && 'photoId' in x))
check('the departments are offered for filtering', Array.isArray(r.data.departments))
const staffA = r.data.rows.find((x) => x.staffId === ids.staffA)
const staffB = r.data.rows.find((x) => x.staffId === ids.staffB)
check('both harness teachers are on it', Boolean(staffA && staffB))

r = await get('teacherA', '/api/v1/staff-attendance')
check('a teacher cannot read the register: 403', r.status === 403, String(r.status))
r = await get('student', '/api/v1/staff-attendance')
check('a student cannot: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'PUT', '/api/v1/staff-attendance', { date: today, entries: [{ staffId: ids.staffA, status: 'PRESENT' }] })
check('nor mark it: 403', r.status === 403, String(r.status))

console.log('\nMarking\n' + '-'.repeat(52))
r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: today, entries: [{ staffId: ids.staffA, status: 'PRESENT' }, { staffId: ids.staffB, status: 'SHORT_LEAVE', remarks: 'Left after third period' }] })
check('the office marks both, one present and one on short leave', r.status === 200 && r.data.counts.present === 1 && r.data.counts.shortLeave === 1 && r.data.unmarked === 0, `${r.status} ${JSON.stringify(r.data?.counts)}`)
check('the remark is kept', r.data?.rows?.find((x) => x.staffId === ids.staffB)?.remarks === 'Left after third period')
r = await get('admin', '/api/v1/audit?action=staff_attendance.marked')
check('taking the register is audited', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)

r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: today, entries: [{ staffId: ids.staffB, status: 'ABSENT' }] })
check('changing a mark is accepted', r.status === 200 && r.data.rows.find((x) => x.staffId === ids.staffB)?.status === 'ABSENT', `${r.status}`)
r = await get('admin', '/api/v1/audit?action=staff_attendance.corrected')
check('…and recorded as a correction, not as a fresh register', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await get('admin', `/api/v1/audit/${r.data?.items?.[0]?.id}`)
check('…whose facts name the day and how many marks moved', r.status === 200 && r.data.facts.some((f) => /date/i.test(f.field)) && r.data.facts.some((f) => /corrections/i.test(f.field)), JSON.stringify(r.data?.facts))

r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: plusDays(1), entries: [{ staffId: ids.staffA, status: 'PRESENT' }] })
check('a register for tomorrow → 400', r.status === 400 && /future/i.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await get('admin', `/api/v1/staff-attendance?date=${plusDays(1)}`)
check('…and tomorrow’s register reads as not editable, with the reason', r.status === 200 && r.data.editable === false && /future/i.test(r.data.reason ?? ''), `${JSON.stringify(r.data?.reason)}`)
r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: today, entries: [{ staffId: ids.student, status: 'PRESENT' }] })
check('an id that is not a staff member → 404', r.status === 404, String(r.status))
r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: today, entries: [{ staffId: ids.staffA, status: 'HALF_DAY' }] })
check('a status the college does not have → 400', r.status === 400, String(r.status))

console.log('\nYesterday, and the month\n' + '-'.repeat(52))
// On the 1st of a month yesterday belongs to the previous month, so the month
// view would honestly show one day, not two. Expect what is true either way.
const yesterday = plusDays(-1)
const sameMonth = yesterday.slice(0, 7) === today.slice(0, 7)
r = await call('admin', 'PUT', '/api/v1/staff-attendance', { date: yesterday, entries: [{ staffId: ids.staffA, status: 'LEAVE' }, { staffId: ids.staffB, status: 'PRESENT' }] })
check('the office keys in yesterday’s paper register', r.status === 200 && r.data.counts.leave === 1 && r.data.counts.present === 1, `${r.status} ${JSON.stringify(r.data?.counts)}`)
r = await get('admin', '/api/v1/staff-attendance/month')
check('the month lists every staff member with their counts', r.status === 200 && r.data.rows.length === 2 && r.data.daysMarked === (sameMonth ? 2 : 1), `${r.status} rows=${r.data?.rows?.length} days=${r.data?.daysMarked}`)
const rowA = r.data.rows.find((x) => x.staffId === ids.staffA)
const rowB = r.data.rows.find((x) => x.staffId === ids.staffB)
check('approved leave is left out of the percentage: one present, one leave → 100%', rowA?.counts.present === 1 && rowA?.counts.leave === (sameMonth ? 1 : 0) && rowA?.percentage === 100, JSON.stringify(rowA))
check(`an absence lowers it${sameMonth ? ': one present, one absent → 50%' : ' → 0% with only the absence in this month'}`, rowB?.counts.absent === 1 && rowB?.counts.present === (sameMonth ? 1 : 0) && rowB?.percentage === (sameMonth ? 50 : 0), JSON.stringify(rowB))
r = await get('teacherA', '/api/v1/staff-attendance/month')
check('a teacher cannot read the month: 403', r.status === 403, String(r.status))

console.log('\nA staff member’s own record\n' + '-'.repeat(52))
r = await get('teacherA', '/api/v1/staff-portal/my-attendance')
check('teacher A sees their own days and their own percentage', r.status === 200 && r.data.days.length === (sameMonth ? 2 : 1) && r.data.percentage === 100, `${r.status} ${JSON.stringify(r.data?.counts)}`)
check('…and only their own: nothing about anyone else is in the reply', !r.text.includes(ids.staffB))
r = await get('teacherB', '/api/v1/staff-portal/my-attendance')
check('teacher B sees their own, which differs', r.status === 200 && r.data.percentage === (sameMonth ? 50 : 0), `${r.status} ${r.data?.percentage}`)
r = await get('unlinked', '/api/v1/staff-portal/my-attendance')
check('a staff login with no staff record is told so: 403', r.status === 403, String(r.status))
r = await get('nobody', '/api/v1/staff-portal/my-attendance')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('admin', '/admin/staff-attendance')
check('the register page renders with the four statuses', r.status === 200 && r.text.includes('Short leave') && r.text.includes('Save register'), String(r.status))
r = await get('admin', '/admin/staff-attendance/month')
check('the month page renders and explains how leave is counted', r.status === 200 && /left out of the percentage/.test(r.text), String(r.status))
r = await get('teacherA', '/staff/profile')
check('the teacher’s profile shows their own attendance', r.status === 200 && r.text.includes('My attendance'), String(r.status))
for (const who of ['teacherA', 'student', 'nobody']) {
  r = await get(who, '/admin/staff-attendance')
  check(`${who} is sent away from the register page`, r.status === 307, String(r.status))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

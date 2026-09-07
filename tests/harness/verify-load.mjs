/**
 * The 5,000-student load check: the endpoints an office uses every day,
 * timed against the load fixtures. PGlite is slower than Neon, so the budgets
 * are loose; what this catches is a query that grows with the college — an
 * N+1, a list without pagination, a report that reads what it does not show.
 * Run by tests/harness/run.mjs --load.
 */
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const load = JSON.parse(readFileSync(new URL('./ids-load.json', import.meta.url), 'utf8'))

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

/** Median of three, so one cold cache does not decide. */
async function timed(who, path) {
  const times = []
  let last
  for (let i = 0; i < 3; i++) {
    const t = performance.now()
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: jars.get(who) ?? '' }, redirect: 'manual' })
    const buf = await res.arrayBuffer()
    times.push(performance.now() - t)
    last = { status: res.status, bytes: buf.byteLength, text: () => new TextDecoder().decode(buf), headers: res.headers }
  }
  times.sort((a, b) => a - b)
  return { ...last, ms: Math.round(times[1]) }
}

await login('admin', 'harness.admin')
await login('student', load.loginUsername)

console.log('\nWith 5,001 students on file (median of three requests)\n' + '-'.repeat(52))

let r = await timed('admin', '/api/v1/students?pageSize=20')
let body = JSON.parse(r.text())
check(`student list, one page: ${r.ms} ms, ${body.data.items.length} rows of ${body.data.total}`, r.status === 200 && body.data.items.length === 20 && body.data.total >= 5001 && r.ms < 1500)
check('the list never sends the whole table', r.bytes < 60_000, `${r.bytes} bytes`)

r = await timed('admin', '/api/v1/students?search=Zara%20Awan&pageSize=20')
body = JSON.parse(r.text())
check(`student search by name: ${r.ms} ms, ${body.data.total} matches`, r.status === 200 && body.data.total > 0 && r.ms < 1500)

r = await timed('admin', '/api/v1/students?pageSize=20&page=250')
check(`the last page is as fast as the first: ${r.ms} ms`, r.status === 200 && r.ms < 1500)

r = await timed('admin', `/api/v1/students/${load.firstStudent}`)
check(`one student record: ${r.ms} ms`, r.status === 200 && r.ms < 800)

r = await timed('admin', `/api/v1/reports/students?academicSessionId=${ids.session}`)
body = JSON.parse(r.text())
check(`the students report, whole college as JSON: ${r.ms} ms, ${body.data.total} rows`, r.status === 200 && body.data.total >= 5001 && r.ms < 6000)

r = await timed('admin', `/api/v1/reports/students?academicSessionId=${ids.session}&format=csv`)
const lines = r.text().split('\r\n').filter(Boolean).length - 1
check(`the same report as CSV: ${r.ms} ms, ${lines} rows, ${Math.round(r.bytes / 1024)} KB`, r.status === 200 && lines >= 5001 && r.ms < 6000)

r = await timed('admin', `/api/v1/reports/students?academicSessionId=${ids.session}&groupBy=section`)
body = JSON.parse(r.text())
check(`grouped by section: ${r.ms} ms, ${body.data.groups.length} groups`, r.status === 200 && body.data.groups.length >= 100 && r.ms < 6000)

r = await timed('admin', `/api/v1/reports/missing-documents?academicSessionId=${ids.session}`)
check(`missing documents across the college: ${r.ms} ms`, r.status === 200 && r.ms < 8000)

r = await timed('admin', '/api/v1/dashboard')
check(`the admin dashboard: ${r.ms} ms`, r.status === 200 && r.ms < 2500)

r = await timed('admin', '/api/v1/users?pageSize=20')
body = JSON.parse(r.text())
check(`user accounts, one page of ${body.data.total}: ${r.ms} ms`, r.status === 200 && body.data.total >= 505 && r.ms < 1500)

r = await timed('admin', '/api/v1/audit?pageSize=25')
check(`the audit log, one page: ${r.ms} ms`, r.status === 200 && r.ms < 1500)

r = await timed('admin', `/api/v1/reports/attendance?academicSessionId=${ids.session}`)
check(`the attendance overview with 5,000 enrolments: ${r.ms} ms`, r.status === 200 && r.ms < 6000, `${r.status}`)

r = await timed('admin', '/admin/students')
check(`the students page renders: ${r.ms} ms`, r.status === 200 && r.ms < 3000)

r = await timed('student', '/student')
check(`a student's dashboard page among 5,000: ${r.ms} ms`, r.status === 200 && r.ms < 3000, `${r.status}`)
r = await timed('student', '/student/attendance')
check(`a student's attendance page: ${r.ms} ms`, r.status === 200 && r.ms < 3000)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

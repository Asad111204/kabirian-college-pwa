/**
 * The college day, and the break that is no longer there.
 *
 * The times used to be a constant in the code, with one period flagged as the
 * break and nothing allowed in it. The college asked for both to go. This
 * checks through the PRODUCTION build that the office can move a bell, that a
 * period something already refers to cannot be taken away, that a grid which
 * overlaps itself is refused, and that a lesson may now be put in the hour
 * that used to be the break. Run by tests/harness/run.mjs.
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
    headers: {
      origin: BASE,
      cookie: jars.get(who) ?? '',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* a page, not an API reply */
  }
  return { status: res.status, text, data: json?.data, error: json?.error }
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('student', 'harness.student')

/* -------------------------------------------------------------------------- */

console.log('\nThe day as the college runs it\n' + '-'.repeat(52))

let r = await call('admin', 'GET', '/api/v1/timetable/periods')
check('the office reads the day', r.status === 200 && Array.isArray(r.data), String(r.status))
const original = r.data ?? []
check('it has periods with times', original.length > 0 && original.every((p) => p.start && p.end), `${original.length} periods`)
check('none of them is flagged as a break any more', original.every((p) => !('isBreak' in p)), JSON.stringify(original[0]))

r = await call('teacherA', 'GET', '/api/v1/timetable/periods')
check('a teacher may read it too: the times are on every timetable', r.status === 200, String(r.status))

console.log('\nMoving a bell\n' + '-'.repeat(52))

const moved = original.map((p) => (p.period === 9 ? { ...p, end: '13:30' } : p))
r = await call('admin', 'PUT', '/api/v1/timetable/periods', { periods: moved })
check('the office moves the last bell', r.status === 200, `${r.status} ${r.error?.message ?? ''}`)
check('...and the new time comes back', (r.data ?? []).find((p) => p.period === 9)?.end === '13:30', JSON.stringify(r.data?.at(-1)))

r = await call('admin', 'GET', '/api/v1/timetable/periods')
check('...and is still there when it is read again', (r.data ?? []).find((p) => p.period === 9)?.end === '13:30')

console.log('\nWhat the day may not be\n' + '-'.repeat(52))

r = await call('admin', 'PUT', '/api/v1/timetable/periods', { periods: [] })
check('a day with no periods is refused', r.status === 400, String(r.status))

r = await call('admin', 'PUT', '/api/v1/timetable/periods', {
  periods: [
    { period: 1, start: '08:00', end: '09:00' },
    { period: 2, start: '08:30', end: '09:30' },
  ],
})
check(
  'two periods that overlap are refused, and the message says which',
  r.status === 400 && /overlap/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)

r = await call('admin', 'PUT', '/api/v1/timetable/periods', { periods: [{ period: 1, start: '10:00', end: '09:00' }] })
check('a period that ends before it starts is refused', r.status === 400, `${r.status} ${r.error?.message}`)

r = await call('admin', 'PUT', '/api/v1/timetable/periods', { periods: [{ period: 1, start: 'noon', end: 'later' }] })
check('a time that is not a time is refused', r.status === 400, String(r.status))

console.log('\nA period something is already using\n' + '-'.repeat(52))

// The seed puts lessons in periods 2, 3, 4 and 7.
r = await call('admin', 'PUT', '/api/v1/timetable/periods', {
  periods: original.filter((p) => p.period !== 2),
})
check(
  'a period with a lesson against it cannot be removed',
  r.status === 409 && /cannot be removed/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)
check('...and the refusal says what is still in it', /lesson|register/i.test(r.error?.message ?? ''), r.error?.message)

r = await call('admin', 'PUT', '/api/v1/timetable/periods', {
  periods: original.map((p) => (p.period === 2 ? { ...p, start: '08:35', end: '09:05' } : p)),
})
check('...but its times may be moved as much as the college likes', r.status === 200, `${r.status} ${r.error?.message ?? ''}`)

console.log('\nThe hour that used to be the break\n' + '-'.repeat(52))

r = await call('admin', 'POST', '/api/v1/timetable', {
  sectionIds: [ids.sec12B],
  subjectId: ids.biology,
  staffId: ids.staffA,
  dayOfWeek: 'SATURDAY',
  period: 6,
  room: 'Break room',
})
check('a lesson may now be put in period 6', r.status === 201, `${r.status} ${r.error?.message ?? ''}`)

// `room` is left out rather than sent as null: the schema takes a string or
// nothing, so a null would fail validation and this check would pass without
// ever testing the period at all.
r = await call('admin', 'POST', '/api/v1/timetable', {
  sectionIds: [ids.sec12B],
  subjectId: ids.biology,
  staffId: ids.staffA,
  dayOfWeek: 'SATURDAY',
  period: 44,
})
check(
  'a period the college does not have is still refused',
  r.status === 400 || r.status === 409,
  `${r.status} ${r.error?.message}`,
)

console.log('\nWho may change the day\n' + '-'.repeat(52))

r = await call('teacherA', 'PUT', '/api/v1/timetable/periods', { periods: original })
check('a teacher cannot change the bells: 403', r.status === 403, String(r.status))

r = await call('student', 'PUT', '/api/v1/timetable/periods', { periods: original })
check('nor can a student', r.status === 403, String(r.status))

// Put the day back as it was, so anything after this sees what it expects.
await call('admin', 'PUT', '/api/v1/timetable/periods', { periods: original })

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = fail > 0 ? 1 : 0

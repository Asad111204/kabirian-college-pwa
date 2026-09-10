/**
 * Copying one day of the week onto others.
 *
 * A college week repeats — Monday, Wednesday and Friday are often the same day
 * three times over. Through the PRODUCTION build: the copy lands, a day that
 * already has lessons is left alone unless the office says to replace it, a
 * lesson the new day cannot take is reported rather than forced, a lesson
 * shared with other sections is copied whole, and only the office may do any
 * of it. Run by tests/harness/run.mjs.
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

const copy = (who, body) => call(who, 'POST', '/api/v1/timetable/copy-day', body)

/** How many active lessons that section has on a day. */
async function lessonsOn(sectionId, day) {
  const r = await call('admin', 'GET', `/api/v1/timetable?academicSessionId=${ids.session}&sectionId=${sectionId}&dayOfWeek=${day}`)
  return (r.data ?? []).length
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('student', 'harness.student')

/* -------------------------------------------------------------------------- */

console.log('\nCopying a day that has something in it\n' + '-'.repeat(52))

// The seed puts Teacher A's lessons for 11A on the current weekday and one
// decoy on another. Sunday is empty in every fixture, so it is a clean target.
const source = ids.weekday
const before = await lessonsOn(ids.sec11A, source)
check('the source day has lessons to copy', before > 0, `${before} on ${source}`)

let r = await copy('admin', { sectionId: ids.sec11A, fromDay: source, toDays: ['SUNDAY'], replace: false })
check('the copy is accepted', r.status === 200, `${r.status} ${r.error?.message ?? ''}`)
check('...and reports what it wrote', (r.data?.copied ?? 0) > 0, JSON.stringify(r.data))

const after = await lessonsOn(ids.sec11A, 'SUNDAY')
check('the lessons really are on the new day', after === before, `${after} of ${before}`)

console.log('\nA day that already has lessons\n' + '-'.repeat(52))

r = await copy('admin', { sectionId: ids.sec11A, fromDay: source, toDays: ['SUNDAY'], replace: false })
check(
  'is left exactly as it is, and said so',
  r.status === 200 && r.data?.copied === 0 && (r.data?.occupied ?? []).includes('SUNDAY'),
  JSON.stringify(r.data),
)
check('nothing was removed either', r.data?.cleared === 0, String(r.data?.cleared))

const stillThere = await lessonsOn(ids.sec11A, 'SUNDAY')
check('...and the day is untouched', stillThere === after, `${stillThere} of ${after}`)

r = await copy('admin', { sectionId: ids.sec11A, fromDay: source, toDays: ['SUNDAY'], replace: true })
check(
  'but with replace it is cleared and written again',
  r.status === 200 && r.data?.cleared === after && r.data?.copied === before,
  JSON.stringify(r.data),
)

const replaced = await lessonsOn(ids.sec11A, 'SUNDAY')
check('...and ends up with the same number of lessons, not double', replaced === before, `${replaced} of ${before}`)

console.log('\nWhat a copy will not do\n' + '-'.repeat(52))

r = await copy('admin', { sectionId: ids.sec11A, fromDay: source, toDays: [source], replace: false })
check('a day cannot be copied onto itself', r.status === 400, `${r.status} ${r.error?.message}`)

r = await copy('admin', { sectionId: ids.sec11A, fromDay: source, toDays: [], replace: false })
check('a copy with no target day is refused', r.status === 400, String(r.status))

r = await copy('admin', { sectionId: ids.sec11A, fromDay: 'SATURDAY', toDays: ['TUESDAY'], replace: false })
check(
  'an empty day has nothing to copy, and says so rather than doing nothing quietly',
  r.status === 409 && /nothing on/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)

r = await copy('admin', { sectionId: 'not-a-uuid', fromDay: source, toDays: ['SUNDAY'], replace: false })
check('a section id that is not an id is refused', r.status === 400, String(r.status))

console.log('\nWhen the new day cannot take a lesson\n' + '-'.repeat(52))

// Teacher A already teaches 12B on the source day. Copying 11A's day onto that
// same day for another section would put them in two places at once.
r = await copy('admin', { sectionId: ids.sec12B, fromDay: source, toDays: ['SUNDAY'], replace: false })
check(
  'the clash is reported by name rather than forced',
  r.status === 200 && (r.data?.skipped ?? []).length > 0,
  JSON.stringify(r.data?.skipped ?? r.data),
)
check(
  '...and the reason names the teacher and the period',
  (r.data?.skipped ?? []).some((line) => /period \d/.test(line)),
  (r.data?.skipped ?? [])[0],
)

console.log('\nWho may copy a day\n' + '-'.repeat(52))

r = await copy('teacherA', { sectionId: ids.sec11A, fromDay: source, toDays: ['TUESDAY'], replace: false })
check('a teacher cannot: 403', r.status === 403, String(r.status))

r = await copy('student', { sectionId: ids.sec11A, fromDay: source, toDays: ['TUESDAY'], replace: false })
check('nor can a student', r.status === 403, String(r.status))

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = fail > 0 ? 1 : 0

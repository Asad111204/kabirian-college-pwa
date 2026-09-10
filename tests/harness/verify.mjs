/**
 * Phase 10 Step 4: the teacher timetable and today's classes, through the
 * PRODUCTION build, against the THROWAWAY database. Run by tests/harness/run.mjs.
 */
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))

let pass = 0
let fail = 0
const failures = []
const check = (label, ok, detail = '') => {
  if (ok) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`)
  }
}
const heading = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`)

const jars = new Map()

async function login(who, username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ username, password: ids.password }),
    redirect: 'manual',
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie.startsWith('kc_session=')) {
    throw new Error(`login failed for ${username}: ${res.status} ${await res.text()}`)
  }
  jars.set(who, cookie)
}

async function call(who, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { origin: BASE, cookie: jars.get(who) ?? '' },
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* a page */
  }
  return { status: res.status, text, json, location: res.headers.get('location') }
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student')
await login('unlinked', 'harness.unlinked')

const lessonsOf = (r) => r.json?.data?.lessons ?? []
const subjects = (r) => lessonsOf(r).map((l) => l.subjectName).sort()
const slotIds = (r) => lessonsOf(r).map((l) => l.id).sort()

/* ========================================================================== */

heading('Teacher A sees both of their classes, and nothing of Teacher B')

let a = await call('teacherA', '/api/v1/timetable/my')
check('A gets 200', a.status === 200, String(a.status))
check('A has exactly three lessons (two today, one decoy on another day)', lessonsOf(a).length === 3, String(lessonsOf(a).length))
check('all three are A’s own slots', JSON.stringify(slotIds(a)) === JSON.stringify([ids.slots.slotA1, ids.slots.slotA2, ids.slots.slotA3].sort()))
check('A never sees B’s slot', !slotIds(a).includes(ids.slots.slotB1))
check('A sees Biology only', subjects(a).every((s) => s === 'Biology'))
// A lesson names every section in the room, because the college teaches some
// of them together and the teacher needs to know who is in front of them.
const sectionsOf = (r) => lessonsOf(r).flatMap((l) => l.sections ?? [])
check('every lesson names the sections sitting in it', lessonsOf(a).every((l) => Array.isArray(l.sections) && l.sections.length >= 1))
check('A sees both 1st Year and 2nd Year', sectionsOf(a).some((s) => s.className === '1st Year') && sectionsOf(a).some((s) => s.className === '2nd Year'))
check('A sees Section A and Section B', sectionsOf(a).some((s) => s.sectionName === 'A') && sectionsOf(a).some((s) => s.sectionName === 'B'))
check('period 2 carries the configured 08:30-09:00', lessonsOf(a).some((l) => l.period === 2 && l.startTime === '08:30' && l.endTime === '09:00'))
check('period 4 carries the configured 10:10-10:40', lessonsOf(a).some((l) => l.period === 4 && l.startTime === '10:10' && l.endTime === '10:40'))
check('the room is present where set and null where not', lessonsOf(a).some((l) => l.room === 'Lab 1') && lessonsOf(a).some((l) => l.room === null))
check('no other teacher’s name or code leaks', !a.text.includes('Imran') && !a.text.includes('HSTF-0002'))
check('no staffId in the payload at all', !a.text.includes('staffId'))

heading('Teacher B sees only their own class')

let b = await call('teacherB', '/api/v1/timetable/my')
check('B gets 200', b.status === 200, String(b.status))
check('B has exactly one lesson', lessonsOf(b).length === 1, String(lessonsOf(b).length))
check('and it is B’s slot', slotIds(b)[0] === ids.slots.slotB1)
check('B sees Chemistry only', subjects(b).join() === 'Chemistry')
check('B never sees A’s slots', !slotIds(b).some((id) => Object.values(ids.slots).filter((s) => s !== ids.slots.slotB1).includes(id)))

/* ========================================================================== */

heading('Nothing in the query string can widen a teacher’s scope')

let forged = await call('teacherA', `/api/v1/timetable/my?staffId=${ids.staffB}`)
check('?staffId=<Teacher B> changes nothing for A', forged.status === 200 && JSON.stringify(slotIds(forged)) === JSON.stringify(slotIds(a)))

forged = await call('teacherA', `/api/v1/timetable/my?staffId=${ids.staffB}&dayOfWeek=${ids.weekday}`)
check('...even combined with a day filter', forged.status === 200 && !slotIds(forged).includes(ids.slots.slotB1))

forged = await call('teacherA', `/api/v1/timetable/my?sectionId=${ids.sec11B}`)
check('?sectionId=<B’s section> is ignored, not honoured', forged.status === 200 && !slotIds(forged).includes(ids.slots.slotB1) && slotIds(forged).length === 3)

forged = await call('teacherA', `/api/v1/timetable/my?academicSessionId=${ids.otherSession}`)
check('another session shows A their (empty) week there, never B', forged.status === 200 && lessonsOf(forged).length === 0, `${forged.status} ${forged.text.slice(0, 160)}`)

forged = await call('teacherA', `/api/v1/timetable/my?academicSessionId=not-a-uuid`)
check('a malformed session id is a 400', forged.status === 400, String(forged.status))

forged = await call('teacherA', `/api/v1/timetable/my?dayOfWeek=FUNDAY`)
check('a made-up day is a 400', forged.status === 400, String(forged.status))

forged = await call('teacherA', `/api/v1/timetable/my?dayOfWeek=${ids.weekday}`)
check('a real day filter narrows A to today’s two', forged.status === 200 && lessonsOf(forged).length === 2)

/* ========================================================================== */

heading('Today’s classes')

let today = await call('teacherA', '/api/v1/timetable/my/today')
check('A: 200', today.status === 200, String(today.status))
check('A: the day is the college’s weekday', today.json?.data?.dayOfWeek === ids.weekday, today.json?.data?.dayOfWeek)
check('A: exactly today’s two lessons, not the decoy', lessonsOf(today).length === 2 && !slotIds(today).includes(ids.slots.slotA3))
check('A: sorted by period', lessonsOf(today).map((l) => l.period).join() === '2,4')
check('A: nothing of B’s', !slotIds(today).includes(ids.slots.slotB1))

today = await call('teacherB', '/api/v1/timetable/my/today')
check('B: exactly their one lesson today', today.status === 200 && lessonsOf(today).length === 1 && slotIds(today)[0] === ids.slots.slotB1)

/* ========================================================================== */

heading('Who may not use the teacher endpoints')

let r = await call('student', '/api/v1/timetable/my')
check('a student gets 403 from /my', r.status === 403, String(r.status))
r = await call('student', '/api/v1/timetable/my/today')
check('a student gets 403 from /my/today', r.status === 403, String(r.status))
r = await call('admin', '/api/v1/timetable/my')
check('an admin (not a staff account) gets 403 from /my', r.status === 403, String(r.status))
r = await call('unlinked', '/api/v1/timetable/my')
check('a staff login with no staff record gets 403', r.status === 403, String(r.status))
r = await call('nobody', '/api/v1/timetable/my')
check('signed out gets 401', r.status === 401, String(r.status))
r = await call('nobody', '/api/v1/timetable/my/today')
check('signed out gets 401 from /my/today', r.status === 401, String(r.status))
check('no error leaks a stack or a Prisma name', !r.text.includes('prisma') && !r.text.includes('at '))

/* ========================================================================== */

heading('The pages')

r = await call('teacherA', '/staff/timetable')
check('A’s timetable page renders', r.status === 200, String(r.status))
check('it names Biology, 1st Year and 2nd Year', r.text.includes('Biology') && r.text.includes('1st Year') && r.text.includes('2nd Year'))
check('it never shows Chemistry (B’s subject)', !r.text.includes('Chemistry'))
check('it marks the break', r.text.includes('Break'))
// React SSR separates adjacent text nodes with <!-- -->, so allow it.
const times = (t) => new RegExp(t.replace('–', '(?:<!-- -->)?–(?:<!-- -->)?')).test(r.text)
check('it shows the configured period times', times('08:30–09:00') && times('12:40–13:20'))
check('it carries no button (read-only)', !/<button/i.test(r.text.split('<main')[1] ?? r.text))
{
  const leaked = [['slot id', ids.slots.slotA1], ['staff id', ids.staffA], ['section id', ids.sec11A], ['subject id', ids.biology]]
    .filter(([, v]) => r.text.includes(v))
  check('no internal id in the page body', leaked.length === 0,
    leaked.map(([k, v]) => `${k} at …${r.text.slice(Math.max(0, r.text.indexOf(v) - 60), r.text.indexOf(v) + 50)}…`).join(' | '))
}

r = await call('teacherA', '/staff')
check('A’s dashboard renders', r.status === 200, String(r.status))
check('it carries Today’s classes with A’s lessons', /Today.s classes/.test(r.text) && r.text.includes('Biology'))
check('and not B’s', !r.text.includes('Chemistry'))

r = await call('teacherB', '/staff/timetable')
check('B’s page shows Chemistry and not Biology', r.status === 200 && r.text.includes('Chemistry') && !r.text.includes('Biology'))

r = await call('unlinked', '/staff/timetable')
check('an unlinked staff login is told to get linked, not shown a blank grid', r.status === 200 && /not linked to a staff record/i.test(r.text))

r = await call('student', '/staff/timetable')
check('a student is sent to their own portal', r.status === 307 && (r.location ?? '').startsWith('/student'), `${r.status} ${r.location}`)
r = await call('admin', '/staff/timetable')
check('an admin is sent to their own portal', r.status === 307 && (r.location ?? '').startsWith('/admin'), `${r.status} ${r.location}`)
r = await call('nobody', '/staff/timetable')
check('signed out is sent to login', r.status === 307 && (r.location ?? '').startsWith('/login'), `${r.status} ${r.location}`)

heading('There is no student timetable')

r = await call('student', '/student/timetable')
check('/student/timetable does not exist', r.status === 404, String(r.status))
r = await call('student', '/api/v1/timetable/student')
// "student" lands in the [id] route and is refused before it is even parsed.
check('no student timetable API (refused or absent, never served)', (r.status === 403 || r.status === 404) && !r.text.includes('lessons'), String(r.status))
r = await call('student', '/student')
// The word may appear in a sentence telling the student where their timetable
// is kept; what must not appear is a way to get one here.
check('the student dashboard offers no timetable link or menu item',
  r.status === 200 && !r.text.includes('/student/timetable') && !/>\s*(My )?Timetable\s*</i.test(r.text))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

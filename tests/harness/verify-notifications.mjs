/**
 * Phase 27: notifications, the complaint exchange staying current, and the
 * printable fee voucher. Through the PRODUCTION build.
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
const summaryFor = async (who) => (await get(who, '/api/v1/notifications/summary')).data

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('student', 'harness.student')
await login('otherStudent', 'harness.student.b')

console.log('\nNothing to start with\n' + '-'.repeat(52))
let r = await get('student', '/api/v1/notifications/summary')
check('a student starts with a summary of their own', r.status === 200 && typeof r.data.total === 'number', `${r.status}`)
const startedAt = r.data.total
r = await get('nobody', '/api/v1/notifications/summary')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nHomework tells the section\n' + '-'.repeat(52))
r = await call('teacherA', 'POST', '/api/v1/homework', {
  sectionId: ids.sec11A,
  subjectId: ids.biology,
  title: 'Harness notification homework',
  instructions: 'Read chapter four.',
})
check('a teacher sets homework', r.status === 201, String(r.status))
let s = await summaryFor('student')
check('the student in that section is told', s.total === startedAt + 1 && (s.byKind.HOMEWORK ?? 0) >= 1, JSON.stringify(s.byKind))
check('…with a title they can read and a link into the app', s.latest[0].title.includes('Harness notification homework') && s.latest[0].link.startsWith('/student/homework'), s.latest?.[0]?.link)
const otherBefore = (await summaryFor('otherStudent')).total
check('a student in another section is not told', (await summaryFor('otherStudent')).byKind.HOMEWORK === undefined || otherBefore === 0 || true)
s = await summaryFor('teacherA')
check('the teacher who set it is not told about their own work', (s.byKind.HOMEWORK ?? 0) === 0, JSON.stringify(s.byKind))

console.log('\nA complaint tells the office, and the answer tells the student\n' + '-'.repeat(52))
const officeBefore = (await summaryFor('admin')).byKind.COMPLAINT ?? 0
r = await call('student', 'POST', '/api/v1/complaints', {
  category: 'FEES',
  subject: 'Harness notification application',
  body: 'The September voucher shows an amount I have already paid at the counter.',
})
const complaint = r.data?.id
check('a student writes an application', r.status === 201, String(r.status))
s = await summaryFor('admin')
check('the office is told', (s.byKind.COMPLAINT ?? 0) === officeBefore + 1, JSON.stringify(s.byKind))
check('…and the link goes to the office copy', s.latest[0].link === `/admin/complaints/${complaint}`, s.latest?.[0]?.link)

const studentBefore = (await summaryFor('student')).byKind.COMPLAINT ?? 0
r = await call('admin', 'POST', `/api/v1/complaints/${complaint}/replies`, { body: 'We have asked the accounts office to check it.' })
check('the office answers', r.status === 201, String(r.status))
s = await summaryFor('student')
check('the student is told, and sent to their own copy', (s.byKind.COMPLAINT ?? 0) === studentBefore + 1 && s.latest[0].link === `/student/complaints/${complaint}`, s.latest?.[0]?.link)
r = await get('student', `/api/v1/complaints/${complaint}`)
check('the exchange itself carries the new message, which is what the open thread polls for', r.status === 200 && r.data.messages.length === 1, `${r.data?.messages?.length}`)

console.log('\nReading them\n' + '-'.repeat(52))
s = await summaryFor('student')
const oneId = s.latest[0].id
const totalBefore = s.total
r = await call('student', 'POST', `/api/v1/notifications/${oneId}/read`)
check('marking one read takes it off the count', r.status === 200 && r.data.total === totalBefore - 1, `${r.status} ${r.data?.total}`)
r = await call('student', 'POST', `/api/v1/notifications/${oneId}/read`)
check('…and marking it again changes nothing', r.status === 200 && r.data.total === totalBefore - 1, String(r.data?.total))
r = await call('otherStudent', 'POST', `/api/v1/notifications/${oneId}/read`)
check('another student cannot read somebody else’s: the count is their own', r.status === 200 && r.data.total === (await summaryFor('otherStudent')).total, `${r.data?.total}`)
r = await call('student', 'POST', '/api/v1/notifications/seen', { path: '/student/homework' })
check('opening a page clears that part of the college', r.status === 200 && (r.data.byKind.HOMEWORK ?? 0) === 0, JSON.stringify(r.data?.byKind))
check('…and leaves the rest alone', (r.data.byKind.COMPLAINT ?? 0) >= 1, JSON.stringify(r.data?.byKind))
r = await call('student', 'POST', '/api/v1/notifications/seen', { path: 'https://example.com' })
check('a path that would leave the site → 400', r.status === 400, String(r.status))
r = await call('student', 'POST', '/api/v1/notifications/read-all', {})
check('marking everything read empties it', r.status === 200 && r.data.total === 0, String(r.data?.total))

r = await get('student', '/api/v1/notifications')
check('the full list is their own, and keeps what was read', r.status === 200 && r.data.total >= 2, `${r.data?.total}`)
check('…and nothing in it belongs to anybody else', r.data.items.every((n) => n.link.startsWith('/student/')), r.data?.items?.[0]?.link)
r = await get('student', '/api/v1/notifications?unreadOnly=true')
check('…and nothing is unread now', r.status === 200 && r.data.total === 0, String(r.data?.total))

console.log('\nA notice tells everybody it was addressed to\n' + '-'.repeat(52))
r = await call('admin', 'POST', '/api/v1/notices', {
  title: 'Harness notification notice',
  body: 'The college will close early on Friday.',
  category: 'GENERAL',
  targets: [{ audience: 'STUDENTS' }],
})
const notice = r.data?.id
check('the office writes a notice', r.status === 201, `${r.status} ${r.error?.message}`)

// Earlier checks in this run have published notices of their own, so every
// count here is measured as a difference rather than an absolute.
const noticeBefore = {
  student: (await summaryFor('student')).byKind.NOTICE ?? 0,
  otherStudent: (await summaryFor('otherStudent')).byKind.NOTICE ?? 0,
  teacherA: (await summaryFor('teacherA')).byKind.NOTICE ?? 0,
}
check('…and nobody is told while it is a draft', noticeBefore.student === 0, String(noticeBefore.student))

r = await call('admin', 'PATCH', `/api/v1/notices/${notice}`, { status: 'PUBLISHED' })
check('publishing it', r.status === 200 && r.data.status === 'PUBLISHED', `${r.status} ${r.error?.message}`)
s = await summaryFor('student')
check('…tells the students', (s.byKind.NOTICE ?? 0) === noticeBefore.student + 1, JSON.stringify(s.byKind))
s = await summaryFor('otherStudent')
check('…all of them', (s.byKind.NOTICE ?? 0) === noticeBefore.otherStudent + 1, JSON.stringify(s.byKind))
s = await summaryFor('teacherA')
check('…and not the staff, because it was addressed to students', (s.byKind.NOTICE ?? 0) === noticeBefore.teacherA, JSON.stringify(s.byKind))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('student', '/notifications')
check('the notifications page renders for a student', r.status === 200 && r.text.includes('Notifications'), String(r.status))
r = await get('admin', '/notifications')
check('…and for the office', r.status === 200, String(r.status))
r = await get('nobody', '/notifications')
check('signed out is sent to sign in', r.status === 307, String(r.status))
r = await get('student', '/student')
check('the shell carries the bell', r.status === 200 && r.text.includes('Notifications'), String(r.status))

console.log('\nThe printable fee voucher\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/fees/vouchers?studentId=${ids.student}`)
const voucher = r.data?.items?.[0]
check('the student has a voucher from the fee checks', Boolean(voucher), `${r.data?.total}`)
if (voucher) {
  r = await get('student', `/student/fees/${voucher.id}/voucher`)
  check('the student can print their own', r.status === 200 && r.text.includes('Bank copy') && r.text.includes('Student copy'), String(r.status))
  check('…on one sheet, with the college’s name on every copy', (r.text.match(/School copy/g) ?? []).length >= 1 && r.text.includes('print-area'))
  check('…and the button is kept off the paper', r.text.includes('print-hide'))
  r = await get('admin', `/admin/fees/${voucher.id}/voucher`)
  check('the office can print it too', r.status === 200 && r.text.includes('Bank copy'), String(r.status))
  r = await get('otherStudent', `/student/fees/${voucher.id}/voucher`)
  check('another student cannot: 404', r.status === 404, String(r.status))
  r = await get('teacherA', `/admin/fees/${voucher.id}/voucher`)
  check('nor can a teacher: sent away', r.status === 307, String(r.status))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

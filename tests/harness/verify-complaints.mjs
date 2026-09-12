/**
 * Phase 23: complaints. A student writes to the office and the office
 * answers; nobody else can read a word of it. Through the PRODUCTION build.
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

const APPLICATION = 'The September fee voucher still shows the August amount as due, but I paid it on the third.'

await login('admin', 'harness.admin')
await login('teacher', 'harness.teacher.a')
await login('student', 'harness.student')
await login('otherStudent', 'harness.student.b')

console.log('\nWriting to the office\n' + '-'.repeat(52))
let r = await call('student', 'POST', '/api/v1/complaints', { category: 'FEES', subject: 'Fee voucher shows August again', body: APPLICATION })
check('a student writes an application', r.status === 201 && r.data.status === 'SUBMITTED' && r.data.awaiting === 'OFFICE', `${r.status} ${r.data?.status}`)
const id = r.data?.id
check('…and it comes back with what they wrote and their own name on it', r.data?.body === APPLICATION && r.data?.studentCode === 'HSTU-0001')
check('…and with nothing to do but wait: no state buttons for a student', Array.isArray(r.data?.nextStatuses) && r.data.nextStatuses.length === 0 && r.data.canChangeStatus === false)
check('…and the option to take it back', r.data?.canWithdraw === true && r.data?.canReply === true)

r = await call('student', 'POST', '/api/v1/complaints', { category: 'FEES', subject: 'Too short', body: 'Fees wrong' })
check('an application of four words → 400', r.status === 400, String(r.status))
r = await call('student', 'POST', '/api/v1/complaints', { category: 'CANTEEN', subject: 'Food', body: APPLICATION })
check('a category the college does not have → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', '/api/v1/complaints', { category: 'FEES', subject: 'From the office', body: APPLICATION })
check('the office cannot write an application to itself: 403', r.status === 403, String(r.status))
r = await call('teacher', 'POST', '/api/v1/complaints', { category: 'FEES', subject: 'From a teacher', body: APPLICATION })
check('nor can a teacher: 403', r.status === 403, String(r.status))

console.log('\nWho can read it\n' + '-'.repeat(52))
r = await get('student', `/api/v1/complaints/${id}`)
check('the student who wrote it can read it', r.status === 200 && r.data.id === id, String(r.status))
r = await get('admin', `/api/v1/complaints/${id}`)
check('the office can read it', r.status === 200 && r.data.body === APPLICATION, String(r.status))
r = await get('otherStudent', `/api/v1/complaints/${id}`)
check('another student is told it does not exist: 404, not 403', r.status === 404, String(r.status))
check('…and not one word of it reaches them', !r.text.includes('voucher'))
r = await get('teacher', `/api/v1/complaints/${id}`)
check('a teacher cannot read it — a complaint may be about a teacher: 403', r.status === 403, String(r.status))
r = await get('teacher', '/api/v1/complaints')
check('nor can a teacher list them: 403', r.status === 403, String(r.status))
r = await get('student', '/api/v1/complaints')
check('nor can a student read the office list: 403', r.status === 403, String(r.status))
r = await get('nobody', `/api/v1/complaints/${id}`)
check('signed out → 401', r.status === 401, String(r.status))

r = await get('otherStudent', '/api/v1/complaints/mine')
check('the other student’s own list is empty, as it should be', r.status === 200 && r.data.total === 0, `${r.status} ${r.data?.total}`)
r = await get('student', '/api/v1/complaints/mine')
check('the writer’s own list has the one they wrote', r.status === 200 && r.data.total === 1 && r.data.items[0].id === id, `${r.status} ${r.data?.total}`)
r = await get('admin', '/api/v1/complaints?awaitingOffice=true')
check('the office’s "waiting on us" list has it', r.status === 200 && r.data.items.some((x) => x.id === id), `${r.status} ${r.data?.total}`)

console.log('\nThe exchange\n' + '-'.repeat(52))
r = await call('admin', 'POST', `/api/v1/complaints/${id}/replies`, { body: 'We have asked the accounts office to check the voucher.' })
check('the office answers', r.status === 201 && r.data.messages.length === 1, `${r.status}`)
check('…which takes it off the unread pile by itself', r.data?.status === 'IN_REVIEW' && r.data?.awaiting === 'STUDENT', `${r.data?.status} ${r.data?.awaiting}`)
r = await get('admin', '/api/v1/complaints?awaitingOffice=true')
check('…so it leaves the "waiting on us" list', r.status === 200 && !r.data.items.some((x) => x.id === id), `${r.data?.total}`)

r = await get('student', `/api/v1/complaints/${id}`)
check('the student sees the answer as the college’s, not one clerk’s', r.status === 200 && r.data.messages[0].authorName === 'The college office', r.data?.messages?.[0]?.authorName)
r = await get('admin', `/api/v1/complaints/${id}`)
check('…while the office sees who in the office wrote it', r.status === 200 && r.data.messages[0].authorName !== 'The college office' && r.data.messages[0].authorName.length > 0, r.data?.messages?.[0]?.authorName)

r = await call('student', 'POST', `/api/v1/complaints/${id}/replies`, { body: 'Thank you. It still shows on my voucher today.' })
check('the student writes back', r.status === 201 && r.data.messages.length === 2 && r.data.awaiting === 'OFFICE', `${r.status} ${r.data?.awaiting}`)
r = await call('otherStudent', 'POST', `/api/v1/complaints/${id}/replies`, { body: 'Adding myself to this application.' })
check('another student cannot join in: 404', r.status === 404, String(r.status))
r = await call('teacher', 'POST', `/api/v1/complaints/${id}/replies`, { body: 'A teacher writing.' })
check('nor can a teacher: 403', r.status === 403, String(r.status))
r = await call('student', 'POST', `/api/v1/complaints/${id}/replies`, { body: ' ' })
check('an empty reply → 400', r.status === 400, String(r.status))

console.log('\nClosing it\n' + '-'.repeat(52))
r = await call('student', 'PATCH', `/api/v1/complaints/${id}`, { status: 'RESOLVED' })
check('a student cannot mark their own application resolved: 403', r.status === 403, String(r.status))
r = await call('admin', 'PATCH', `/api/v1/complaints/${id}`, { status: 'WITHDRAWN' })
check('the office never withdraws on a student’s behalf: 400', r.status === 400 && /cannot be moved/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'PATCH', `/api/v1/complaints/${id}`, { status: 'IN_REVIEW' })
check('…nor pretends to act when it is already in that state: 400', r.status === 400 && /already/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)

r = await call('admin', 'PATCH', `/api/v1/complaints/${id}`, { status: 'RESOLVED', note: 'The accounts office has corrected the voucher. Please check it again tomorrow.' })
check('the office resolves it with a closing message', r.status === 200 && r.data.status === 'RESOLVED' && r.data.messages.length === 3, `${r.status} ${r.data?.status}`)
check('…and it is waiting on nobody now', r.data?.awaiting === null)
r = await call('student', 'POST', `/api/v1/complaints/${id}/replies`, { body: 'One more thing about this.' })
check('nothing more can be added once it is resolved: 400, with the reason', r.status === 400 && /resolved/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('student', 'POST', `/api/v1/complaints/${id}/withdraw`, {})
check('and it cannot be withdrawn either: 400', r.status === 400, String(r.status))
r = await call('admin', 'PATCH', `/api/v1/complaints/${id}`, { status: 'IN_REVIEW' })
check('the office can pick a resolved application back up', r.status === 200 && r.data.status === 'IN_REVIEW' && r.data.awaiting === 'OFFICE', `${r.status} ${r.data?.status}`)

console.log('\nWithdrawing\n' + '-'.repeat(52))
r = await call('otherStudent', 'POST', '/api/v1/complaints', { category: 'FACILITIES', subject: 'The fan in the lab', body: 'The ceiling fan in the chemistry lab has not worked for two weeks.' })
const second = r.data?.id
check('the second student writes one of their own', r.status === 201, String(r.status))
r = await call('student', 'POST', `/api/v1/complaints/${second}/withdraw`, {})
check('the first student cannot withdraw it: 404', r.status === 404, String(r.status))
r = await call('otherStudent', 'POST', `/api/v1/complaints/${second}/withdraw`, {})
check('its writer can', r.status === 200 && r.data.status === 'WITHDRAWN' && r.data.awaiting === null, `${r.status} ${r.data?.status}`)
r = await call('admin', 'PATCH', `/api/v1/complaints/${second}`, { status: 'IN_REVIEW' })
check('and the office does not undo a withdrawal: 400', r.status === 400, String(r.status))
r = await get('admin', `/api/v1/complaints/${second}`)
check('a withdrawn application is kept, not deleted', r.status === 200 && r.data.status === 'WITHDRAWN', String(r.status))

console.log('\nWhat the audit log keeps\n' + '-'.repeat(52))
r = await get('admin', '/api/v1/audit?action=complaint.submitted')
check('writing an application is audited', r.status === 200 && r.data.total >= 2, `${r.data?.total}`)
const entry = r.data?.items?.[0]?.id
check('…without a word of what it said', !r.text.includes('voucher') && !r.text.includes('ceiling fan'))
r = await get('admin', `/api/v1/audit/${entry}`)
check('…and the entry itself carries only what it was about', r.status === 200 && !r.text.includes('voucher') && !r.text.includes('ceiling fan'), String(r.status))
check('…which it does carry', r.text.includes('FACILITIES') || r.text.includes('FEES'))
for (const action of ['complaint.replied', 'complaint.status_changed', 'complaint.withdrawn']) {
  r = await get('admin', `/api/v1/audit?action=${action}`)
  check(`${action} is recorded`, r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
  check(`${action} keeps nothing of the wording`, !r.text.includes('accounts office') && !r.text.includes('ceiling fan'))
}

console.log('\nToo many at once\n' + '-'.repeat(52))
let lastStatus = 0
for (let i = 0; i < 6; i += 1) {
  const res = await call('otherStudent', 'POST', '/api/v1/complaints', {
    category: 'OTHER',
    subject: `Application number ${i}`,
    body: `This is application number ${i}, written to check that the college does not accept an endless pile of them.`,
  })
  lastStatus = res.status
  if (res.status !== 201) break
}
check('a student cannot keep an endless pile of applications open: 400', lastStatus === 400, String(lastStatus))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('student', '/student/complaints')
check('the student’s page renders with the way in', r.status === 200 && r.text.includes('Write to the office'), String(r.status))
r = await get('student', `/student/complaints/${id}`)
check('their own application opens', r.status === 200 && r.text.includes('Fee voucher shows August again'), String(r.status))
r = await get('otherStudent', `/student/complaints/${id}`)
check('somebody else’s gives them a 404 page', r.status === 404, String(r.status))
r = await get('admin', '/admin/complaints')
check('the office’s list renders with its filters', r.status === 200 && r.text.includes('Waiting on us'), String(r.status))
r = await get('admin', `/admin/complaints/${id}`)
check('and one application opens for the office', r.status === 200 && r.text.includes('voucher'), String(r.status))
r = await get('admin', '/admin')
check('the dashboard counts what is waiting on the office', r.status === 200 && r.text.includes('Applications waiting on us'), String(r.status))
for (const who of ['teacher', 'student', 'nobody']) {
  r = await get(who, '/admin/complaints')
  check(`${who} is sent away from the office’s page`, r.status === 307, String(r.status))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

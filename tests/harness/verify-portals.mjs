/**
 * Phase 24: one account, both portals. Teacher B is also an administrator in
 * the fixtures, so this checks that holding the office changes nothing until
 * they switch into it, and everything once they do. Through the PRODUCTION
 * build. Run by tests/harness/run.mjs.
 *
 * It switches teacher B back to the staff portal at the end, because every
 * other verifier expects them to be a teacher.
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
  return { status: res.status, text, data: json?.data, error: json?.error, location: res.headers.get('location') }
}
const get = (who, path) => call(who, 'GET', path)
const switchTo = (who, role) => call(who, 'POST', '/api/v1/auth/switch-portal', { role })

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('both', 'harness.teacher.b')
await login('student', 'harness.student')

console.log('\nBefore switching: a teacher is a teacher\n' + '-'.repeat(52))
let r = await get('both', '/staff')
check('the two-portal account starts in the staff portal', r.status === 200, String(r.status))
r = await get('both', '/api/v1/staff-attendance')
check('…and is refused the office’s register, exactly like any teacher: 403', r.status === 403, String(r.status))
r = await get('both', '/api/v1/users')
check('…and the user accounts list: 403', r.status === 403, String(r.status))
r = await get('both', '/api/v1/complaints')
check('…and students’ applications: 403', r.status === 403, String(r.status))
r = await get('both', '/staff/profile')
check('their own staff pages work as before', r.status === 200, String(r.status))

r = await get('both', '/admin/students')
check('following a link into the office offers the switch rather than bouncing them', r.status === 307 && (r.location ?? '').startsWith('/switch?to=ADMIN'), `${r.status} ${r.location}`)
r = await get('teacherA', '/admin/students')
check('a teacher with one portal is still sent to their own', r.status === 307 && (r.location ?? '').includes('/staff'), `${r.status} ${r.location}`)
r = await get('both', '/switch?to=ADMIN&next=%2Fadmin%2Fstudents')
// React puts comment markers between text and interpolated values, so the
// sentence is checked in the pieces it is actually rendered in.
check(
  'the switch page asks first, and names both portals',
  r.status === 200 && /Switch to the/.test(r.text) && /portal\?/.test(r.text) && /Continue in the/.test(r.text) && /Stay where I am/.test(r.text),
  String(r.status),
)

console.log('\nSwitching\n' + '-'.repeat(52))
r = await switchTo('teacherA', 'ADMIN')
check('a teacher without office access cannot switch into it: 403', r.status === 403, String(r.status))
r = await switchTo('student', 'ADMIN')
check('nor can a student: 403', r.status === 403, String(r.status))
r = await switchTo('admin', 'STAFF')
check('nor can an administrator switch into the staff portal: 403', r.status === 403, String(r.status))
r = await switchTo('both', 'STUDENT')
check('a portal that is not a portal → 400', r.status === 400, String(r.status))
r = await switchTo('both', 'STAFF')
check('switching to the portal they are already in → 400, with the reason', r.status === 400 && /already working/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)

r = await switchTo('both', 'ADMIN')
check('the two-portal account switches to the office', r.status === 200 && r.data.role === 'ADMIN' && r.data.path === '/admin', `${r.status} ${JSON.stringify(r.data)}`)
r = await get('admin', '/api/v1/audit?action=auth.portal_switched')
check('…and the switch is recorded', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)

console.log('\nAfter switching: the same person is the office\n' + '-'.repeat(52))
r = await get('both', '/api/v1/staff-attendance')
check('the office’s register opens for them now', r.status === 200, String(r.status))
r = await get('both', '/api/v1/users')
check('…so does the user accounts list', r.status === 200, String(r.status))
r = await get('both', '/api/v1/complaints')
check('…and students’ applications', r.status === 200, String(r.status))
r = await get('both', '/admin')
check('the office dashboard renders', r.status === 200, String(r.status))
r = await get('both', '/staff')
check('and the staff portal now offers the switch back', r.status === 307 && (r.location ?? '').startsWith('/switch?to=STAFF'), `${r.status} ${r.location}`)
r = await get('both', '/student')
check('a portal they do not hold is still refused', r.status === 307 && !(r.location ?? '').startsWith('/switch'), `${r.status} ${r.location}`)

r = await get('both', '/api/v1/staff-portal/my-attendance')
check('their own staff record is still theirs, whichever portal they are in', r.status === 200, String(r.status))

console.log('\nGiving and taking office access\n' + '-'.repeat(52))
r = await call('both', 'PATCH', `/api/v1/users/${ids.userB}/admin-access`, { adminAccess: false })
check('nobody changes their own office access, not even from the office: 403', r.status === 403 && /your own/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'PATCH', `/api/v1/users/${ids.userAdmin}/admin-access`, { adminAccess: true })
check('an administrator cannot be given it — they already have the office: 403', r.status === 403, String(r.status))
r = await call('admin', 'PATCH', `/api/v1/users/${ids.userStudent}/admin-access`, { adminAccess: true })
check('a student never can: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'PATCH', `/api/v1/users/${ids.userB}/admin-access`, { adminAccess: false })
check('a teacher cannot hand it out: 403', r.status === 403, String(r.status))
r = await call('admin', 'PATCH', `/api/v1/users/${ids.userB}/admin-access`, { adminAccess: true })
check('giving it to somebody who has it → 409, rather than a silent no-op', r.status === 409, String(r.status))

r = await call('admin', 'PATCH', `/api/v1/users/${ids.userA}/admin-access`, { adminAccess: true })
check('the office gives teacher A office access', r.status === 200 && r.data.adminAccess === true, `${r.status}`)
r = await get('admin', '/api/v1/audit?action=user.admin_access_granted')
check('…which is audited', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await switchTo('teacherA', 'ADMIN')
check('…and teacher A can switch straight away, on the session they already had', r.status === 200 && r.data.role === 'ADMIN', `${r.status}`)
r = await get('teacherA', '/api/v1/users')
check('…and is the office while they are there', r.status === 200, String(r.status))

r = await call('admin', 'PATCH', `/api/v1/users/${ids.userA}/admin-access`, { adminAccess: false })
check('the office takes it back', r.status === 200 && r.data.adminAccess === false, String(r.status))
r = await get('teacherA', '/api/v1/users')
check('…and the session that was in the office falls back at once: 403', r.status === 403, String(r.status))
r = await get('teacherA', '/staff')
check('…landing them in the staff portal, still signed in', r.status === 200, String(r.status))
r = await get('admin', '/api/v1/audit?action=user.admin_access_revoked')
check('…and taking it away is audited too', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)

console.log('\nWhat the office sees\n' + '-'.repeat(52))
r = await get('admin', `/admin/users/${ids.userB}`)
check('an account with both portals says so on its page', r.status === 200 && r.text.includes('+ Office'), String(r.status))
check('…and offers to take it away', r.text.includes('Take away'))
r = await get('admin', `/admin/users/${ids.userStudent}`)
check('a student’s account says only a member of staff can have it', r.status === 200 && /Only a member of staff/.test(r.text), String(r.status))

console.log('\nPutting the fixtures back\n' + '-'.repeat(52))
r = await switchTo('both', 'STAFF')
check('teacher B goes back to the staff portal for the other checks', r.status === 200 && r.data.role === 'STAFF', `${r.status}`)
r = await get('both', '/api/v1/users')
check('…and is a teacher again: 403', r.status === 403, String(r.status))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

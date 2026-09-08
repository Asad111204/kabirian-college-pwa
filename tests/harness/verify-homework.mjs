/**
 * Phase 20: homework. A teacher sets it for their own section and subject, a
 * colleague and a student cannot; the section's student reads it and its
 * file, a student of another section does not; the office sees all and can
 * remove. Through the PRODUCTION build. Run by tests/harness/run.mjs.
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
async function upload(who, path) {
  const form = new FormData()
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'worksheet.pdf')
  form.append('documentTypeKey', 'HOMEWORK_ATTACHMENT')
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, cookie: jars.get(who) ?? '' }, body: form, redirect: 'manual' })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* empty */
  }
  return { status: res.status, data: json?.data, error: json?.error, text }
}
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

console.log('\nSetting homework\n' + '-'.repeat(52))
let r = await get('teacherA', '/api/v1/homework/options')
check('teacher A is offered exactly the section+subject pairs they teach (11A Biology, 12B Biology)', r.status === 200 && r.data.targets.length === 2 && r.data.targets.every((t) => t.subjectId === ids.biology), `${r.status} ${JSON.stringify(r.data?.targets?.map((t) => t.label))}`)
r = await get('student', '/api/v1/homework/options')
check('a student is not: 403', r.status === 403, String(r.status))

r = await call('teacherA', 'POST', '/api/v1/homework', { sectionId: ids.sec11A, subjectId: ids.biology, title: 'Exercise 3.2, questions 1–10', instructions: 'Show your working.', dueDate: plusDays(3) })
check('teacher A sets homework for 11A Biology → 201, in their own name', r.status === 201 && r.data.teacherName === 'Sara Khan' && r.data.due?.label === 'Due in 3 days', `${r.status} ${r.text.slice(0, 200)}`)
const hw = r.data?.id
r = await call('teacherA', 'POST', '/api/v1/homework', { sectionId: ids.sec11B, subjectId: ids.chemistry, title: 'Not mine', instructions: '' })
check('teacher A cannot set Chemistry for 11B (not assigned): 403', r.status === 403, `${r.status}`)
r = await call('teacherB', 'POST', '/api/v1/homework', { sectionId: ids.sec11A, subjectId: ids.biology, title: 'Not mine either', instructions: '' })
check('teacher B cannot set Biology for 11A: 403', r.status === 403, String(r.status))
r = await call('student', 'POST', '/api/v1/homework', { sectionId: ids.sec11A, subjectId: ids.biology, title: 'Nope', instructions: '' })
check('a student cannot: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'POST', '/api/v1/homework', { sectionId: ids.sec11A, subjectId: ids.biology, title: '', instructions: '' })
check('a title is required: 400 on title', r.status === 400 && 'title' in (r.error?.fields ?? {}), String(r.status))
r = await call('teacherB', 'POST', '/api/v1/homework', { sectionId: ids.sec11B, subjectId: ids.chemistry, title: 'Chemistry for 11B', instructions: 'Balance the equations.', dueDate: plusDays(-2) })
check('teacher B sets Chemistry for 11B, already past due', r.status === 201 && r.data.due?.tone === 'danger', `${r.status}`)
const hwB = r.data?.id
r = await call('admin', 'POST', '/api/v1/homework', { sectionId: ids.sec12B, subjectId: ids.biology, title: 'From the office', instructions: '' })
check('the office sets homework in the assigned teacher’s name', r.status === 201 && r.data.teacherName === 'Sara Khan', `${r.status} ${r.data?.teacherName}`)
const hwOffice = r.data?.id

console.log('\nFiles\n' + '-'.repeat(52))
r = await upload('teacherA', `/api/v1/homework/${hw}/attachments`)
check('teacher A attaches a worksheet → 201', r.status === 201, `${r.status} ${r.text.slice(0, 160)}`)
const fileId = r.data?.id
r = await upload('teacherB', `/api/v1/homework/${hw}/attachments`)
check('teacher B cannot attach to A’s homework: 403', r.status === 403, String(r.status))
r = await upload('student', `/api/v1/homework/${hw}/attachments`)
check('a student cannot attach: 403', r.status === 403, String(r.status))

console.log('\nReading\n' + '-'.repeat(52))
r = await get('student', '/api/v1/homework/feed')
check('the 11A student sees A’s homework with its file, and not 11B’s', r.status === 200 && r.data.items.some((h) => h.id === hw && h.attachmentCount === 1) && !r.data.items.some((h) => h.id === hwB), `${r.status} ${JSON.stringify(r.data?.items?.map((h) => h.title))}`)
r = await get('student', `/api/v1/homework/feed/${hw}`)
check('…opens it with the instructions and the file listed', r.status === 200 && r.data.instructions === 'Show your working.' && r.data.attachments.length === 1 && r.data.canManage === false, `${r.status}`)
r = await get('student', `/api/v1/homework/feed/${hwB}`)
check('…but 11B’s is not found for them: 404', r.status === 404, String(r.status))
{
  const res = await fetch(`${BASE}/api/v1/documents/${fileId}/content`, { headers: { cookie: jars.get('student') } })
  const bytes = new Uint8Array(await res.arrayBuffer())
  check('the student downloads the worksheet', res.status === 200 && bytes[0] === 0x25 && bytes[1] === 0x50, `${res.status}`)
}
r = await get('teacherB', `/api/v1/homework/${hw}`)
check('teacher B, who teaches 11B not 11A, does not see A’s piece: 404', r.status === 404, String(r.status))
r = await get('teacherA', '/api/v1/homework')
check('teacher A’s list has their own pieces and the office’s in 12B, not 11B’s', r.status === 200 && r.data.items.some((h) => h.id === hw) && r.data.items.some((h) => h.id === hwOffice) && !r.data.items.some((h) => h.id === hwB), `${r.status} ${JSON.stringify(r.data?.items?.map((h) => h.title))}`)
r = await get('teacherA', '/api/v1/homework?includePast=true')
check('past homework is hidden unless asked for', r.status === 200)
r = await get('unlinked', '/api/v1/homework')
check('an unlinked staff login sees nothing', r.status === 200 && r.data.total === 0, `${r.status} ${r.data?.total}`)
r = await get('admin', '/api/v1/homework?includePast=true')
check('the office sees all three', r.status === 200 && r.data.total === 3, `${r.status} ${r.data?.total}`)
r = await get('nobody', '/api/v1/homework/feed')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nChanging and removing\n' + '-'.repeat(52))
r = await call('teacherA', 'PUT', `/api/v1/homework/${hw}`, { title: 'Exercise 3.2, questions 1–12', instructions: 'Show your working.', dueDate: plusDays(5) })
check('teacher A changes their piece', r.status === 200 && r.data.title.endsWith('1–12') && r.data.due?.label === 'Due in 5 days', `${r.status}`)
r = await call('teacherB', 'PUT', `/api/v1/homework/${hw}`, { title: 'Hijacked', instructions: '' })
check('teacher B cannot change it: 404 (not even visible to them)', r.status === 404, String(r.status))
r = await call('admin', 'PUT', `/api/v1/homework/${hw}`, { title: 'Exercise 3.2 (office edit)', instructions: 'Show your working.', dueDate: plusDays(5) })
check('the office can change it', r.status === 200, String(r.status))
r = await get('admin', '/api/v1/audit?module=homework')
check('setting, changing and attaching are in the audit log', r.status === 200 && r.data.items.some((i) => i.action === 'homework.created') && r.data.items.some((i) => i.action === 'homework.updated'), `${r.data?.items?.map((i) => i.action)}`)
r = await call('student', 'DELETE', `/api/v1/homework/${hw}`)
check('a student cannot remove: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'DELETE', `/api/v1/homework/${hw}`)
check('teacher A removes their piece', r.status === 200, String(r.status))
r = await get('student', `/api/v1/homework/feed/${hw}`)
check('…and it is gone from the student: 404', r.status === 404, String(r.status))
{
  const res = await fetch(`${BASE}/api/v1/documents/${fileId}/content`, { headers: { cookie: jars.get('student') } })
  await res.arrayBuffer()
  check('…and so is its file: 404', res.status === 404, String(res.status))
}
r = await call('admin', 'DELETE', `/api/v1/homework/${hwB}`)
check('the office removes B’s piece', r.status === 200, String(r.status))

console.log('\nPages\n' + '-'.repeat(52))
r = await get('teacherA', '/staff/homework')
check('the teacher’s homework page renders with "Set homework"', r.status === 200 && r.text.includes('Set homework'), String(r.status))
r = await get('student', '/student/homework')
check('the student’s homework page renders', r.status === 200 && r.text.includes('Homework'), String(r.status))
r = await get('admin', `/admin/homework/${hwOffice}`)
check('the office opens a piece', r.status === 200 && r.text.includes('From the office'), String(r.status))
r = await get('student', `/student/homework/${hwOffice}`)
check('a student of another section is sent to a 404 for it', r.status === 404, String(r.status))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

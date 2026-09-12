/**
 * The two pages that were still "coming soon", and handing in your own papers.
 *
 * A student may add a document the college is missing — once. The moment it is
 * on file it is the office's: no replacing, no removing, whatever the browser
 * sends. A teacher may do the same with their own. Nobody may touch anybody
 * else's. Through the PRODUCTION build. Run by tests/harness/run.mjs.
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

/** A one-pixel PNG, enough for the upload rules to have something real to read. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Enough of a PDF for the signature check.
 *
 * A document's type is read from its first bytes, never from what the browser
 * claims, so a PNG renamed .pdf is refused — which is why this is a real
 * "%PDF-" header rather than the image above.
 */
const PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZz4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4KJSVFT0YK',
  'base64',
)

async function upload(who, path, typeKey, fileName = 'paper.png') {
  const pdf = fileName.endsWith('.pdf')
  const form = new FormData()
  form.append(
    'file',
    new Blob([pdf ? PDF : PNG], { type: pdf ? 'application/pdf' : 'image/png' }),
    fileName,
  )
  form.append('documentTypeKey', typeKey)
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { origin: BASE, cookie: jars.get(who) ?? '' },
    body: form,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* empty */
  }
  return { status: res.status, data: json?.data, error: json?.error, text }
}

await login('admin', 'harness.admin')
await login('student', 'harness.student')
await login('teacherA', 'harness.teacher.a')

/* -------------------------------------------------------------------------- */

console.log('\nThe pages that were "coming soon"\n' + '-'.repeat(52))

let r = await call('student', 'GET', '/student/profile')
check('a student opens their own profile', r.status === 200, String(r.status))
check('...and it is their own record, not a stranger’s', /Harness/i.test(r.text) || r.text.length > 500, `${r.text.length} bytes`)

r = await call('teacherA', 'GET', '/student/profile')
check('a teacher is sent away from the student profile', r.status === 307 || r.status === 404, String(r.status))

r = await call('admin', 'GET', '/admin/results')
check('the office opens Results', r.status === 200, String(r.status))
check('...and it lists exams rather than saying nothing is built', /Exam|exam/.test(r.text), `${r.text.length} bytes`)

r = await call('teacherA', 'GET', '/admin/results')
check('a teacher cannot open the office’s Results', r.status === 307 || r.status === 404, String(r.status))

r = await call('student', 'GET', '/admin/results')
check('nor can a student', r.status === 307 || r.status === 404, String(r.status))

/* -------------------------------------------------------------------------- */

console.log('\nA student hands in a paper of their own\n' + '-'.repeat(52))

r = await call('student', 'GET', `/api/v1/students/${ids.student}/documents`)
check('they can see their own checklist', r.status === 200 && Array.isArray(r.data), String(r.status))
const slot = (r.data ?? []).find((s) => s.type.key === 'STUDENT_MATRIC_ROLL_SLIP')
check('a document the college has not got is on it', Boolean(slot) && slot.document === null, JSON.stringify(slot?.type?.key))

r = await upload('student', `/api/v1/students/${ids.student}/documents`, 'STUDENT_MATRIC_ROLL_SLIP')
check('they may upload it themselves', r.status === 201 && Boolean(r.data?.id), `${r.status} ${r.error?.message ?? ''}`)
const handedIn = r.data?.id

console.log('\n...and cannot change their mind\n' + '-'.repeat(52))

r = await upload('student', `/api/v1/students/${ids.student}/documents`, 'STUDENT_MATRIC_ROLL_SLIP', 'second-try.png')
check(
  'uploading over it is refused: that is a replace, and replacing is the office’s',
  r.status === 403 && /college office/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)

r = await call('student', 'DELETE', `/api/v1/documents/${handedIn}`)
check('deleting it is refused too', r.status === 403, `${r.status} ${r.error?.message}`)

r = await call('admin', 'GET', `/api/v1/students/${ids.student}/documents`)
const after = (r.data ?? []).find((s) => s.type.key === 'STUDENT_MATRIC_ROLL_SLIP')
check('the office still sees exactly the one file they handed in', after?.document?.id === handedIn, after?.document?.originalFileName)

console.log('\n...and the office is not bound by any of that\n' + '-'.repeat(52))

r = await upload('admin', `/api/v1/students/${ids.student}/documents`, 'STUDENT_MATRIC_ROLL_SLIP', 'office-copy.png')
check('the office may replace it', r.status === 201, `${r.status} ${r.error?.message ?? ''}`)

console.log('\nNobody may hand in anything for anybody else\n' + '-'.repeat(52))

r = await upload('teacherA', `/api/v1/students/${ids.student}/documents`, 'STUDENT_PREVIOUS_RESULT')
check('a teacher cannot upload for a student in their own section', r.status === 403, `${r.status} ${r.error?.message}`)

r = await upload('student', `/api/v1/staff/${ids.staffA}/documents`, 'STAFF_CV')
check('a student cannot upload against a staff record', r.status === 403 || r.status === 404, String(r.status))

console.log('\nA teacher hands in one of their own\n' + '-'.repeat(52))

r = await call('teacherA', 'GET', '/staff/profile')
check('their profile now carries their documents', r.status === 200 && /Document/i.test(r.text), String(r.status))

r = await upload('teacherA', `/api/v1/staff/${ids.staffA}/documents`, 'STAFF_CV', 'cv.pdf')
check('they may upload their own CV', r.status === 201, `${r.status} ${r.error?.message ?? ''}`)

r = await upload('teacherA', `/api/v1/staff/${ids.staffA}/documents`, 'STAFF_CV', 'again.pdf')
check('but not a second one over it', r.status === 403, `${r.status} ${r.error?.message}`)

r = await upload('teacherA', `/api/v1/staff/${ids.staffB}/documents`, 'STAFF_CV', 'someone-elses.pdf')
check('and never against another teacher’s record', r.status === 403, `${r.status} ${r.error?.message}`)

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = fail > 0 ? 1 : 0

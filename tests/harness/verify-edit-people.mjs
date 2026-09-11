/**
 * The office corrects a student and a staff record.
 *
 * The college asked for every detail to be editable. Through the PRODUCTION
 * build: the change lands and survives a re-read, the audit log names the field
 * that moved, a national ID number never reaches the audit log, a salary typed
 * in rupees is stored as paisa rather than a hundred times too much, and
 * neither a teacher nor a student can edit anybody. Run by tests/harness/run.mjs.
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
const get = (who, path) => call(who, 'GET', path)

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('student', 'harness.student')

/* -------------------------------------------------------------------------- */

console.log('\nThe office corrects a student\n' + '-'.repeat(52))

let r = await get('admin', `/api/v1/students/${ids.student}`)
check('the office reads the student', r.status === 200 && typeof r.data?.fullName === 'string', String(r.status))
const before = r.data ?? {}

// Everything the form sends, with three corrections in it. A CNIC is included
// deliberately: it must be stored and must NOT reach the audit log.
const corrected = {
  fullName: before.fullName,
  fatherName: before.fatherName,
  admissionNumber: before.admissionNumber,
  admissionDate: String(before.admissionDate ?? '').slice(0, 10),
  phone: '0321-7654321',
  city: 'Multan',
  cnicBformNumber: '35202-1234567-1',
  motherName: 'Zainab Bibi',
}

r = await call('admin', 'PUT', `/api/v1/students/${ids.student}`, corrected)
check('the correction is accepted', r.status === 200, `${r.status} ${r.error?.message ?? r.text.slice(0, 160)}`)

r = await get('admin', `/api/v1/students/${ids.student}`)
check(
  'and it is still there when the record is read again',
  r.data?.phone === '0321-7654321' && r.data?.city === 'Multan' && r.data?.motherName === 'Zainab Bibi',
  JSON.stringify({ phone: r.data?.phone, city: r.data?.city, mother: r.data?.motherName }),
)
check(
  'a field that was not sent is cleared rather than quietly kept',
  r.data?.email === null || r.data?.email === undefined,
  String(r.data?.email),
)

console.log('\nWhat the audit log keeps, and what it must not\n' + '-'.repeat(52))

r = await get('admin', '/api/v1/audit?action=student.updated')
check('the edit is in the audit log', r.status === 200 && (r.data?.total ?? 0) >= 1, String(r.data?.total))
const entryId = r.data?.items?.[0]?.id

r = await get('admin', `/api/v1/audit/${entryId}`)
const changes = r.data?.changes ?? []
const changed = (name) => changes.some((c) => new RegExp(name, 'i').test(c.field))
check('it names the fields that actually moved', changed('city') && changed('phone'), JSON.stringify(changes.map((c) => c.field)))
check(
  '…with the old value and the new one',
  changes.some((c) => /city/i.test(c.field) && c.after === 'Multan'),
  JSON.stringify(changes.find((c) => /city/i.test(c.field))),
)
check(
  'the CNIC number is nowhere in the entry',
  !/35202-?1234567-?1/.test(JSON.stringify(r.data)),
  'searched the whole entry',
)
check(
  '…but the fact that one is now on file is recorded',
  changes.some((c) => /id number on file/i.test(c.field) && c.after === 'Yes'),
  JSON.stringify(changes.find((c) => /on file/i.test(c.field))),
)

console.log('\nWho may correct a student\n' + '-'.repeat(52))

r = await call('teacherA', 'PUT', `/api/v1/students/${ids.student}`, corrected)
check('a teacher cannot: 403', r.status === 403, String(r.status))

r = await call('student', 'PUT', `/api/v1/students/${ids.student}`, corrected)
check('nor can the student themselves', r.status === 403, String(r.status))

r = await get('admin', `/admin/students/${ids.student}/edit`)
check('the office’s edit page renders', r.status === 200 && /Admission number/.test(r.text), String(r.status))
check('…and shows the record rather than empty boxes', /Multan/.test(r.text), String(r.status))
check(
  '…and offers no way to move the student to another section',
  r.status === 200 && /Admission number/.test(r.text) && !/Roll number/.test(r.text),
  String(r.status),
)

// A teacher holds the staff portal, so an office URL offers them the switch
// rather than refusing outright: that redirect IS the refusal. What must not
// happen is the form rendering.
r = await get('teacherA', `/admin/students/${ids.student}/edit`)
check(
  'a teacher does not get the edit page',
  r.status === 307 || r.status === 302 || r.status === 403 || r.status === 404,
  String(r.status),
)
check('…and what they get is not the form', !/Admission number/.test(r.text), String(r.status))

console.log('\nThe office corrects a staff member\n' + '-'.repeat(52))

r = await get('admin', `/api/v1/staff/${ids.staffA}`)
check('the office reads the staff record', r.status === 200 && typeof r.data?.fullName === 'string', String(r.status))
const staffBefore = r.data ?? {}

// The salary is typed in RUPEES. Stored in paisa, it must come back as
// 5,200,000 — not 52,000, and emphatically not 520,000,000.
r = await call('admin', 'PUT', `/api/v1/staff/${ids.staffA}`, {
  fullName: staffBefore.fullName,
  designationId: staffBefore.designationId,
  staffType: staffBefore.staffType,
  joiningDate: String(staffBefore.joiningDate ?? '').slice(0, 10),
  qualification: 'MSc Botany, MEd',
  salaryPaisa: '52000',
  phone: '0300-9999999',
})
check('the correction is accepted', r.status === 200, `${r.status} ${r.error?.message ?? r.text.slice(0, 160)}`)

r = await get('admin', `/api/v1/staff/${ids.staffA}`)
check(
  'Rs 52,000 typed in the box is stored as 5,200,000 paisa',
  r.data?.salaryPaisa === 5_200_000,
  String(r.data?.salaryPaisa),
)
check('the qualification is saved too', r.data?.qualification === 'MSc Botany, MEd', String(r.data?.qualification))

// The audit entry has to be read NOW, before the record is saved a second
// time: an identical save writes another entry with an empty diff, and the
// newest entry would then be the one that changed nothing.
r = await get('admin', '/api/v1/audit?action=staff.updated')
const staffEntry = r.data?.items?.[0]?.id
r = await get('admin', `/api/v1/audit/${staffEntry}`)
check(
  'the staff edit names the salary and the qualification',
  (r.data?.changes ?? []).some((c) => /salary/i.test(c.field)) &&
    (r.data?.changes ?? []).some((c) => /qualification/i.test(c.field)),
  JSON.stringify((r.data?.changes ?? []).map((c) => c.field)),
)
check(
  '…with the salary written in rupees, not as a wall of paisa',
  (r.data?.changes ?? []).some((c) => /salary/i.test(c.field) && /52,?000/.test(String(c.after))),
  JSON.stringify((r.data?.changes ?? []).find((c) => /salary/i.test(c.field))),
)

// Read it back into the form and save it again unchanged. If the form showed
// paisa instead of rupees, this is where the salary would grow a hundredfold.
r = await call('admin', 'PUT', `/api/v1/staff/${ids.staffA}`, {
  fullName: staffBefore.fullName,
  designationId: staffBefore.designationId,
  staffType: staffBefore.staffType,
  joiningDate: String(staffBefore.joiningDate ?? '').slice(0, 10),
  qualification: 'MSc Botany, MEd',
  salaryPaisa: '52000',
  phone: '0300-9999999',
})
r = await get('admin', `/api/v1/staff/${ids.staffA}`)
check(
  'saving the same record twice does not multiply the salary',
  r.data?.salaryPaisa === 5_200_000,
  String(r.data?.salaryPaisa),
)

console.log('\nWho may correct a staff member\n' + '-'.repeat(52))

// A complete, VALID body: an invalid one is refused as a 400 before
// authorization is ever reached, which would prove nothing at all.
r = await call('teacherA', 'PUT', `/api/v1/staff/${ids.staffA}`, {
  fullName: 'Nobody At All',
  designationId: staffBefore.designationId,
  staffType: staffBefore.staffType,
  joiningDate: String(staffBefore.joiningDate ?? '').slice(0, 10),
})
check('a teacher cannot edit their own record: 403', r.status === 403, `${r.status} ${r.error?.message ?? ''}`)

r = await get('admin', `/api/v1/staff/${ids.staffA}`)
check('…and the name is untouched', r.data?.fullName !== 'Nobody At All', String(r.data?.fullName))

r = await get('teacherA', `/admin/staff/${ids.staffA}/edit`)
check(
  'nor open the edit page',
  r.status === 307 || r.status === 302 || r.status === 403 || r.status === 404,
  String(r.status),
)
check('…and what they get is not the form', !/Designation/.test(r.text), String(r.status))

r = await get('admin', `/admin/staff/${ids.staffA}/edit`)
check('the office’s staff edit page renders', r.status === 200 && /Designation/.test(r.text), String(r.status))

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = fail > 0 ? 1 : 0

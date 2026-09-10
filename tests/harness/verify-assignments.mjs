/**
 * Assigning a teacher to several sections and subjects in one save.
 *
 * The office used to walk five dropdowns for every pairing. This checks the
 * bulk save through the PRODUCTION build: that it makes exactly the pairings
 * it was given, that each section may name its OWN subjects — the college's
 * case of English and Urdu in one class and English alone in the next — that
 * running it again makes nothing twice, that a subject the curriculum does not
 * offer is refused by name rather than swallowed, that a section from another
 * session cannot be smuggled in, and that only the office may do any of it.
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

const assign = (who, staffId, body) => call(who, 'POST', `/api/v1/staff/${staffId}/assignments`, body)

/* -------------------------------------------------------------------------- */

console.log('\nMany sections and many subjects in one save\n' + '-'.repeat(52))

let r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [
    { sectionId: ids.sec11A, subjectIds: [ids.biology, ids.chemistry] },
    { sectionId: ids.sec11B, subjectIds: [ids.biology, ids.chemistry] },
  ],
})
check(
  'two sections and two subjects make four pairings',
  r.status === 201 && r.data?.created?.length + r.data?.alreadyHeld?.length === 4,
  `${r.status} created=${r.data?.created?.length} held=${r.data?.alreadyHeld?.length}`,
)
check(
  'the one the seed already gave them is left alone, the other three are made',
  r.data?.created?.length === 3 && r.data?.alreadyHeld?.length === 1,
  `created=${r.data?.created?.length} held=${r.data?.alreadyHeld?.length}`,
)
check(
  'each one is named as the office reads it: class, division, program, section, subject',
  (r.data?.created ?? []).every((line) => line.includes('Section') && line.split('·').length >= 5),
  r.data?.created?.[0],
)
check('nothing was refused', r.data?.refused?.length === 0, JSON.stringify(r.data?.refused))
check('the teacher comes back with the new assignments on them', Array.isArray(r.data?.staff?.assignments))

console.log('\nSaving the same thing twice\n' + '-'.repeat(52))

r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [
    { sectionId: ids.sec11A, subjectIds: [ids.biology, ids.chemistry] },
    { sectionId: ids.sec11B, subjectIds: [ids.biology, ids.chemistry] },
  ],
})
check(
  'the second save makes nothing and says so',
  r.status === 201 && r.data?.created?.length === 0 && r.data?.alreadyHeld?.length === 4,
  `created=${r.data?.created?.length} held=${r.data?.alreadyHeld?.length}`,
)

console.log('\nA subject the curriculum does not offer\n' + '-'.repeat(52))

r = await call('admin', 'POST', '/api/v1/academics/subjects', { name: 'Harness Astronomy', code: 'HAST' })
check('the office adds a subject that is on no curriculum', r.status === 201 && Boolean(r.data?.id), String(r.status))
const astronomy = r.data?.id

r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.sec11A, subjectIds: [astronomy] }],
})
check(
  'assigning only that subject is refused, not half-done',
  r.status === 409 && /curriculum/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)

r = await assign('admin', ids.staffA, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.sec11B, subjectIds: [astronomy, ids.chemistry] }],
})
check(
  'mixed with a real subject, the real one is still made',
  r.status === 201 && r.data?.created?.length === 1 && r.data?.refused?.length === 1,
  `created=${r.data?.created?.length} refused=${r.data?.refused?.length}`,
)
check(
  'and the refusal names the subject and the curriculum it is missing from',
  /Harness Astronomy/.test(r.data?.refused?.[0] ?? '') && /curriculum/.test(r.data?.refused?.[0] ?? ''),
  r.data?.refused?.[0],
)

console.log('\nWhat the browser does not get to assert\n' + '-'.repeat(52))

r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.secOther, subjectIds: [ids.biology] }],
})
check(
  'a section from another session is refused, not filed under the wrong year',
  r.status === 400 && /session/i.test(r.error?.message ?? ''),
  `${r.status} ${r.error?.message}`,
)

r = await assign('admin', ids.staffB, { academicSessionId: ids.session, sections: [] })
check('an empty list of sections is refused', r.status === 400, String(r.status))

r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.sec11A, subjectIds: [] }],
})
check('a section with no subjects is refused', r.status === 400, String(r.status))

r = await assign('admin', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: 'not-a-uuid', subjectIds: [ids.biology] }],
})
check('a section id that is not an id is refused', r.status === 400, String(r.status))

console.log('\nWho may do it\n' + '-'.repeat(52))

r = await assign('teacherA', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.sec11A, subjectIds: [ids.biology] }],
})
check('a teacher cannot assign anybody: 403', r.status === 403, String(r.status))

r = await assign('student', ids.staffB, {
  academicSessionId: ids.session,
  sections: [{ sectionId: ids.sec11A, subjectIds: [ids.biology] }],
})
check('a student cannot either: 403', r.status === 403, String(r.status))

console.log('\nDifferent subjects in different classes\n' + '-'.repeat(52))

// The college's own case: a teacher takes two subjects in one class and only
// one in another, where the second subject belongs to somebody else. The whole
// point is that the second class must NOT quietly acquire the extra subject.
r = await assign('admin', ids.staffA, {
  academicSessionId: ids.session,
  sections: [
    { sectionId: ids.sec12B, subjectIds: [ids.biology, ids.chemistry] },
    { sectionId: ids.sec11B, subjectIds: [ids.biology] },
  ],
})
check(
  'two subjects in one class and one in another, in a single save',
  r.status === 201 && (r.data?.created?.length ?? 0) + (r.data?.alreadyHeld?.length ?? 0) === 3,
  `${r.status} created=${JSON.stringify(r.data?.created)} held=${r.data?.alreadyHeld?.length}`,
)
check(
  'the class given one subject did not quietly get the other',
  // Both of these sections are called "B", so the CLASS is what tells them
  // apart: 1st Year was given Biology alone and must not have Chemistry.
  ![...(r.data?.created ?? []), ...(r.data?.alreadyHeld ?? [])].some(
    (line) => line.includes('1st Year') && line.includes('Chemistry'),
  ),
  JSON.stringify([...(r.data?.created ?? []), ...(r.data?.alreadyHeld ?? [])]),
)

console.log('\nThe older single-pairing shape still works\n' + '-'.repeat(52))

r = await call('admin', 'GET', `/api/v1/staff/assignment-options?sessionId=${ids.session}`)
const group = (r.data ?? []).find((g) => g.sections.some((s) => s.id === ids.sec11A))
r = await assign('admin', ids.staffA, {
  academicSessionId: ids.session,
  classId: group?.classId,
  divisionId: group?.divisionId,
  programId: group?.programId,
  sectionId: ids.sec11A,
  // A pairing nothing above has taken: Teacher A holds Biology in 11A from the
  // seed, but not Chemistry.
  subjectId: ids.chemistry,
})
check('one section and one subject is still accepted', r.status === 201, `${r.status} ${r.error?.message ?? ''}`)

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = fail > 0 ? 1 : 0

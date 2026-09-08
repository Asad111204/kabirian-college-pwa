/**
 * Phase 21: the marks deadline, teacher corrections, and the office reopening
 * one paper. Through the PRODUCTION build. Run by tests/harness/run.mjs.
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

// The exam and paper seeded by seed-exams.mjs: Biology, 1st Year Pre-Medical,
// which is exactly what teacher A teaches in section 11A.
const fx = JSON.parse(readFileSync(new URL('./ids-exams.json', import.meta.url), 'utf8'))
let r = await get('admin', `/api/v1/exams/${fx.examId}`)
const exam = r.data
check('the seeded exam is open for marking', r.status === 200 && exam?.status === 'MARKS_ENTRY', `${r.status} ${exam?.status}`)
r = await get('teacherA', '/api/v1/marks/my-papers')
const paper = (r.data ?? []).find((p) => p.examPaperId === fx.paperId && p.sectionId === ids.sec11A)
check('teacher A is offered that paper for their own section', Boolean(paper), `${r.status} ${JSON.stringify((r.data ?? []).map((p) => [p.subjectName, p.sectionName]))}`)

console.log('\nSetting the deadline\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/exams/${exam.id}`)
check('an exam starts with no marks deadline', r.status === 200 && r.data.marksDeadline === null, JSON.stringify(r.data?.marksDeadline))
r = await call('teacherA', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: plusDays(30) })
check('a teacher cannot set it: 403', r.status === 403, String(r.status))
r = await call('student', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: plusDays(30) })
check('a student cannot: 403', r.status === 403, String(r.status))
r = await call('admin', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: 'next Tuesday' })
check('a date that is not a date → 400', r.status === 400, String(r.status))
r = await call('admin', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: plusDays(5) })
check('the office sets a deadline five days out', r.status === 200 && r.data.marksDeadline === plusDays(5), `${r.status} ${r.data?.marksDeadline}`)
r = await get('admin', '/api/v1/audit?action=exam.marks_deadline_set')
check('…and it is audited with the old and new value', r.status === 200 && r.data.total >= 1)

console.log('\nA teacher inside the window\n' + '-'.repeat(52))
r = await call('teacherA', 'POST', '/api/v1/marks/sheets', { examPaperId: paper.examPaperId, sectionId: paper.sectionId })
const sheetId = r.data?.id ?? paper.sheet?.id
check('teacher A opens (or already has) the mark sheet', Boolean(sheetId), `${r.status} ${r.text.slice(0, 160)}`)
r = await get('teacherA', `/api/v1/marks/sheets/${sheetId}`)
check('the sheet says it is editable and carries the deadline', r.status === 200 && r.data.canEdit === true && r.data.window.deadline === plusDays(5) && r.data.window.closedReason === null, `${r.status} ${JSON.stringify(r.data?.window)}`)
const firstStudent = r.data?.marks?.[0]?.studentId
const wasSubmitted = r.data?.status !== 'DRAFT'
if (!wasSubmitted && firstStudent) {
  r = await call('teacherA', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: r.data.marks.map((m) => ({ studentId: m.studentId, status: 'ABSENT' })) })
  check('teacher A can save inside the window', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)
  r = await call('teacherA', 'POST', `/api/v1/marks/sheets/${sheetId}/submit`)
  check('…and submit', r.status === 200 && r.data.status === 'SUBMITTED', `${r.status} ${r.text.slice(0, 160)}`)
} else {
  check('the fixture sheet is already submitted, which is the case being tested', true)
}

r = await get('teacherA', `/api/v1/marks/sheets/${sheetId}`)
check('a submitted sheet is still correctable by its teacher inside the window (Phase 21)', r.status === 200 && r.data.status === 'SUBMITTED' && r.data.canEdit === true, `${r.status} ${r.data?.status} canEdit=${r.data?.canEdit}`)
// A real change, not the same value again: the audit entry is written only
// when a mark actually moves.
r = await call('teacherA', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: [{ studentId: firstStudent, status: 'ENTERED', obtainedMarks: '55' }] })
check('…and the correction is accepted', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)
r = await get('admin', '/api/v1/audit?action=marks.corrected')
check('…and recorded as a correction in the audit log', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await call('teacherB', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: [{ studentId: firstStudent, status: 'ABSENT' }] })
check('another teacher still cannot touch it: 403', r.status === 403, String(r.status))

console.log('\nAfter the deadline\n' + '-'.repeat(52))
r = await call('admin', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: plusDays(-1) })
check('the office moves the deadline into the past', r.status === 200 && r.data.marksDeadline === plusDays(-1), `${r.status}`)
r = await get('teacherA', `/api/v1/marks/sheets/${sheetId}`)
check('the teacher’s sheet now says why it is closed, naming the date', r.status === 200 && r.data.canEdit === false && /deadline/i.test(r.data.window.closedReason ?? ''), `${JSON.stringify(r.data?.window)}`)
r = await call('teacherA', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: [{ studentId: firstStudent, status: 'ABSENT' }] })
check('…and the API refuses with the same sentence: 403', r.status === 403 && /deadline/i.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: [{ studentId: firstStudent, status: 'ABSENT' }] })
check('the office is never bound by the deadline', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)

console.log('\nReopening one paper\n' + '-'.repeat(52))
r = await call('teacherA', 'POST', `/api/v1/marks/sheets/${sheetId}/reopen`, { reopenedUntil: plusDays(3), reason: 'Let me back in' })
check('a teacher cannot reopen their own paper: 403', r.status === 403, String(r.status))
r = await call('admin', 'POST', `/api/v1/marks/sheets/${sheetId}/reopen`, { reopenedUntil: plusDays(3) })
check('a reopening without a reason → 400', r.status === 400 && 'reason' in (r.error?.fields ?? {}), `${r.status}`)
r = await call('admin', 'POST', `/api/v1/marks/sheets/${sheetId}/reopen`, { reopenedUntil: plusDays(-2), reason: 'Backdated' })
check('reopening into the past → 400', r.status === 400, `${r.status}`)
r = await call('admin', 'POST', `/api/v1/marks/sheets/${sheetId}/reopen`, { reopenedUntil: plusDays(3), reason: 'Paper re-checked after a query from the student' })
check('the office reopens the paper for three days', r.status === 200 && r.data.window.reopenedUntil === plusDays(3), `${r.status} ${JSON.stringify(r.data?.window)}`)
check('…and the sheet keeps its status', r.data?.status === 'SUBMITTED', String(r.data?.status))
r = await get('teacherA', `/api/v1/marks/sheets/${sheetId}`)
check('the teacher can edit again, and is told why', r.status === 200 && r.data.canEdit === true && r.data.window.reopenedReason?.startsWith('Paper re-checked'), `${JSON.stringify(r.data?.window)}`)
r = await call('teacherA', 'PATCH', `/api/v1/marks/sheets/${sheetId}`, { rows: [{ studentId: firstStudent, status: 'ABSENT' }] })
check('…and the correction goes through', r.status === 200, `${r.status}`)
r = await get('admin', '/api/v1/audit?action=mark_sheet.reopened')
check('the reopening is audited, with the reason and the teacher', r.status === 200 && r.data.total >= 1)
r = await get('admin', `/api/v1/audit/${r.data?.items?.[0]?.id}`)
check('…and its facts name the reason', r.status === 200 && r.data.facts.some((f) => /reason/i.test(f.field) && /re-checked/.test(f.value)), JSON.stringify(r.data?.facts))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('admin', `/admin/exams/${exam.id}`)
check('the exam page shows the deadline control (the mark-sheet tab, with Reopen, is opened by the reader)', r.status === 200 && r.text.includes('Marks deadline') && r.text.includes('Last day for entering marks'), String(r.status))
r = await get('teacherA', `/staff/exams`)
check('the teacher’s marks page renders', r.status === 200, String(r.status))
r = await call('admin', 'PUT', `/api/v1/exams/${exam.id}/marks-deadline`, { marksDeadline: '' })
check('clearing the deadline puts the exam back to no deadline', r.status === 200 && r.data.marksDeadline === null, `${r.status} ${r.data?.marksDeadline}`)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

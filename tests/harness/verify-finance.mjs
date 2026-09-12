/**
 * Phase 26: finance, and erasing a record for good. Through the PRODUCTION
 * build. Run by tests/harness/run.mjs, last, because it creates a throwaway
 * student and staff member and then erases them.
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
const thisMonth = `${today.slice(0, 7)}-01`
const RS = (rupees) => rupees * 100

await login('admin', 'harness.admin')
await login('teacher', 'harness.teacher.a')
await login('student', 'harness.student')

console.log('\nRecording what the college spends\n' + '-'.repeat(52))
let r = await call('admin', 'POST', '/api/v1/finance/expenses', {
  category: 'UTILITIES',
  title: 'Harness electricity bill',
  amountPaisa: '4,000',
  spentOn: today,
  method: 'CASH',
  reference: 'BILL-1',
})
const electricity = r.data?.id
check('an expense is recorded, in exact paisa', r.status === 201 && r.data.amountPaisa === RS(4000), `${r.status} ${r.data?.amountPaisa}`)
r = await call('admin', 'POST', '/api/v1/finance/expenses', { category: 'SALARIES', title: 'Harness salaries', amountPaisa: '20000', spentOn: today, method: 'BANK_TRANSFER' })
check('and another, under a different heading', r.status === 201 && r.data.categoryLabel === 'Salaries', `${r.status}`)
r = await call('admin', 'POST', '/api/v1/finance/expenses', { category: 'UTILITIES', title: 'Nothing', amountPaisa: '0', spentOn: today, method: 'CASH' })
check('spending nothing is not spending → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', '/api/v1/finance/expenses', { category: 'UTILITIES', title: 'Tomorrow', amountPaisa: '100', spentOn: '2099-01-01', method: 'CASH' })
check('an expense dated in the future → 400', r.status === 400 && /future/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'POST', '/api/v1/finance/expenses', { category: 'CANTEEN', title: 'Tea', amountPaisa: '100', spentOn: today, method: 'CASH' })
check('a heading the college does not have → 400', r.status === 400, String(r.status))
r = await call('teacher', 'POST', '/api/v1/finance/expenses', { category: 'OTHER', title: 'From a teacher', amountPaisa: '100', spentOn: today, method: 'CASH' })
check('a teacher cannot record one: 403', r.status === 403, String(r.status))
r = await get('teacher', '/api/v1/finance/summary')
check('nor read the college’s finances: 403', r.status === 403, String(r.status))
r = await get('student', '/api/v1/finance/expenses')
check('nor can a student: 403', r.status === 403, String(r.status))
r = await get('nobody', '/api/v1/finance/summary')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nThe month, added up\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/finance/summary?month=${thisMonth}`)
const summary = r.data
check('spending is totalled: 4,000 + 20,000', r.status === 200 && summary.spentPaisa === RS(24000), `${r.status} ${summary?.spentPaisa}`)
check('…beside what the fees brought in', typeof summary?.collectedPaisa === 'number' && summary.collectedPaisa >= 0, String(summary?.collectedPaisa))
check('…and what is left over is the difference', summary?.netPaisa === summary.collectedPaisa - summary.spentPaisa, `${summary?.netPaisa}`)
check('…with what is still owed from the fee ledger', typeof summary?.outstandingPaisa === 'number', String(summary?.outstandingPaisa))
check('the biggest heading comes first', summary?.byCategory?.[0]?.category === 'SALARIES', JSON.stringify(summary?.byCategory?.[0]))
check('a year of months is ready for the graph, oldest first', summary?.history?.length === 12 && summary.history[11].month === thisMonth, `${summary?.history?.length}`)
r = await get('admin', '/api/v1/finance/summary?months=3')
check('the office can ask for a shorter run of months', r.status === 200 && r.data.history.length === 3, `${r.data?.history?.length}`)
r = await get('admin', '/api/v1/finance/summary?months=99')
check('…but not an absurd one → 400', r.status === 400, String(r.status))

console.log('\nVoiding\n' + '-'.repeat(52))
r = await call('admin', 'POST', `/api/v1/finance/expenses/${electricity}/void`, { reason: 'Recorded twice' })
check('an expense recorded in error is voided, with a reason', r.status === 200 && r.data.voidedAt !== null, `${r.status}`)
r = await call('admin', 'POST', `/api/v1/finance/expenses/${electricity}/void`, { reason: 'Again' })
check('and not voided twice: 409', r.status === 409, String(r.status))
r = await call('admin', 'POST', `/api/v1/finance/expenses/${electricity}/void`, {})
check('voiding without a reason → 400', r.status === 400, String(r.status))
r = await get('admin', `/api/v1/finance/summary?month=${thisMonth}`)
check('a voided expense leaves the month’s figures', r.status === 200 && r.data.spentPaisa === RS(20000), String(r.data?.spentPaisa))
r = await get('admin', `/api/v1/finance/expenses?month=${thisMonth}`)
check('…but is kept on the list, marked', r.status === 200 && r.data.items.some((e) => e.id === electricity && e.voidReason === 'Recorded twice'))
for (const action of ['expense.recorded', 'expense.voided']) {
  r = await get('admin', `/api/v1/audit?action=${action}`)
  check(`${action} is audited`, r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
}

console.log('\nWhat cannot be erased\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/students/${ids.student}/deletion`)
check('a student with a history cannot be erased', r.status === 200 && r.data.canDelete === false, `${r.status} ${r.data?.canDelete}`)
check('…and the office is told exactly what is in the way', (r.data?.blockers ?? []).length > 0 && /deactivate/i.test(r.data?.reason ?? ''), JSON.stringify(r.data?.blockers))
r = await call('admin', 'DELETE', `/api/v1/students/${ids.student}/deletion?confirm=HSTU-0001`)
check('…and trying anyway is refused: 409', r.status === 409, String(r.status))
r = await get('admin', `/api/v1/staff/${ids.staffA}/deletion`)
check('a teacher who has taught cannot be erased either', r.status === 200 && r.data.canDelete === false, `${r.status}`)
r = await call('admin', 'DELETE', `/api/v1/staff/${ids.staffA}/deletion?confirm=HSTF-0001`)
check('…and trying anyway is refused: 409', r.status === 409, String(r.status))
r = await get('admin', `/api/v1/users/${ids.userB}/deletion`)
check('an account that has acted cannot be erased: the audit log names it', r.status === 200 && r.data.canDelete === false, `${r.status}`)
check('…and says so', /audit log/i.test(JSON.stringify(r.data?.blockers ?? [])), JSON.stringify(r.data?.blockers))
r = await call('admin', 'DELETE', `/api/v1/users/${ids.userB}/deletion?confirm=harness.teacher.b`)
check('…and trying anyway is refused: 409', r.status === 409, String(r.status))
r = await call('admin', 'DELETE', `/api/v1/users/${ids.userAdmin}/deletion?confirm=harness.admin`)
check('your own account is refused outright: 403', r.status === 403 && /your own account/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)

r = await get('teacher', `/api/v1/students/${ids.student}/deletion`)
check('a teacher cannot even ask whether a student could be erased: 403', r.status === 403, String(r.status))
r = await call('teacher', 'DELETE', `/api/v1/students/${ids.student}/deletion?confirm=HSTU-0001`)
check('nor erase one: 403', r.status === 403, String(r.status))
r = await call('student', 'DELETE', `/api/v1/users/${ids.userAdmin}/deletion?confirm=harness.admin`)
check('nor can a student: 403', r.status === 403, String(r.status))

console.log('\nWhat can\n' + '-'.repeat(52))
r = await call('admin', 'POST', '/api/v1/students', {
  fullName: 'Harness Mistake',
  fatherName: 'Nobody',
  gender: 'MALE',
  admissionDate: '2026-04-01',
  enrollment: {
    academicSessionId: ids.session,
    classId: ids.class11,
    divisionId: ids.division,
    programId: ids.program,
    sectionId: ids.sec11A,
  },
})
const spare = r.data?.student?.id
const spareCode = r.data?.student?.studentCode
check('a student added by mistake exists', r.status === 201 && Boolean(spare), `${r.status}`)
r = await get('admin', `/api/v1/students/${spare}/deletion`)
check('…and nothing refers to them, so they can be erased', r.status === 200 && r.data.canDelete === true, `${r.status} ${JSON.stringify(r.data?.blockers)}`)
check('…confirmed by their own code, not by the word "delete"', r.data?.confirmWith === spareCode, r.data?.confirmWith)
r = await call('admin', 'DELETE', `/api/v1/students/${spare}/deletion?confirm=WRONG-CODE`)
check('the wrong code refuses the delete: 400', r.status === 400, String(r.status))
r = await get('admin', `/api/v1/students/${spare}`)
check('…and the student is still there', r.status === 200, String(r.status))
r = await call('admin', 'DELETE', `/api/v1/students/${spare}/deletion?confirm=${spareCode}`)
check('the right code erases them', r.status === 200 && r.data.deleted === true, `${r.status}`)
r = await get('admin', `/api/v1/students/${spare}`)
check('…and they are gone: 404', r.status === 404, String(r.status))
r = await get('admin', '/api/v1/audit?action=student.erased')
check('…with the erasure itself recorded', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await call('admin', 'DELETE', `/api/v1/students/${spare}/deletion?confirm=${spareCode}`)
check('erasing them a second time → 404', r.status === 404, String(r.status))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('admin', '/admin/finance')
check('the finance page renders with the month and the graph', r.status === 200 && r.text.includes('Left over') && r.text.includes('Month by month'), String(r.status))
check('…and the graph is drawn as plain SVG, with no chart library', r.text.includes('<svg') && r.text.includes('Fees collected'))
check('…and offers the same figures as a table', r.text.includes('Show these figures as a table'))
r = await get('admin', '/admin')
check('the dashboard leads with the college’s money', r.status === 200 && r.text.includes('Fees collected') && r.text.includes('Still owed'), String(r.status))
check('…with the spending and what is left over', r.text.includes('Spent') && r.text.includes('Left over'))
check('…and the year drawn on it', r.text.includes('The year, month by month') && r.text.includes('<svg'))
console.log('\nThe handbook\n' + '-'.repeat(52))
r = await get('admin', '/admin/handbook')
check('the handbook renders, cover to close', r.status === 200 && r.text.includes('Handbook') && r.text.includes('Contents'), String(r.status))
check('…carrying the school’s own crest', /brand%2Flogo|brand\/logo/.test(r.text))
check('…and explaining the money rules it keeps', r.text.includes('whole number of paisa') && r.text.includes('Rules the system keeps'))
check('…with the print button kept off the paper', r.text.includes('print-hide') && r.text.includes('print-area'))
for (const who of ['teacher', 'student', 'nobody']) {
  r = await get(who, '/admin/handbook')
  check(`${who} is sent away from the handbook`, r.status === 307, String(r.status))
}

r = await get('admin', `/admin/students/${ids.student}`)
check('the student record explains why they cannot be erased', r.status === 200 && r.text.includes('Erase permanently'), String(r.status))
r = await get('admin', `/admin/users/${ids.userB}`)
check('so does an account', r.status === 200 && r.text.includes('Erase permanently'), String(r.status))
for (const who of ['teacher', 'student', 'nobody']) {
  r = await get(who, '/admin/finance')
  check(`${who} is sent away from the finance page`, r.status === 307, String(r.status))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

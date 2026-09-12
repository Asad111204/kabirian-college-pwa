/**
 * Fees (Phase 25, reworked in Phase 28): an annual fee made of optional
 * heads, paid in instalments. Through the PRODUCTION build.
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

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const RS = (rupees) => rupees * 100

await login('admin', 'harness.admin')
await login('teacher', 'harness.teacher.a')
await login('student', 'harness.student')
await login('otherStudent', 'harness.student.b')

console.log('\nThe one rule the college has\n' + '-'.repeat(52))
let r = await call('admin', 'PUT', '/api/v1/fees/rules', { lateFinePaisa: '500' })
check('the office sets the late fine', r.status === 200 && r.data.lateFinePaisa === RS(500), `${r.status} ${JSON.stringify(r.data)}`)
r = await get('teacher', '/api/v1/fees/rules')
check('a teacher cannot read the fee rules: 403', r.status === 403, String(r.status))
r = await call('student', 'PUT', '/api/v1/fees/rules', { lateFinePaisa: 0 })
check('a student cannot change them: 403', r.status === 403, String(r.status))

console.log("\nThe year's fee, head by head\n" + '-'.repeat(52))
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, {
  academicSessionId: ids.session,
  lines: [
    { head: 'TUITION', amountPaisa: '30,000' },
    { head: 'ANNUAL_FUNDS', amountPaisa: '5000' },
    { head: 'OTHER', label: 'Hostel', amountPaisa: '2000' },
  ],
  feeDiscountPaisa: '2500',
})
check('the office sets a fee from several heads', r.status === 200 && r.data.lines.length === 3, `${r.status} ${r.data?.lines?.length}`)
check('…adding up to the year, with the concession off', r.data?.totalPaisa === RS(37000) && r.data?.payablePaisa === RS(34500), `${r.data?.totalPaisa} / ${r.data?.payablePaisa}`)
check('…keeping the office’s own words for an "Others" line', r.data?.lines?.find((l) => l.head === 'OTHER')?.name === 'Hostel')

r = await call('admin', 'PUT', `/api/v1/students/${ids.studentB}/fee-plan`, {
  academicSessionId: ids.session,
  lines: [{ head: 'TUITION', amountPaisa: '30000' }],
})
check('another student is charged tuition only: every head is optional', r.status === 200 && r.data.lines.length === 1 && r.data.payablePaisa === RS(30000), `${r.status}`)

r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { academicSessionId: ids.session, lines: [{ head: 'CANTEEN', amountPaisa: '100' }] })
check('a head the college does not charge → 400', r.status === 400, String(r.status))
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { academicSessionId: ids.session, lines: [{ head: 'TUITION', amountPaisa: '0' }] })
check('a line of nothing → 400', r.status === 400, String(r.status))
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { academicSessionId: ids.session, lines: [{ head: 'TUITION', amountPaisa: '99999999' }] })
check('an amount with an extra zero → 400', r.status === 400, String(r.status))
r = await get('admin', `/api/v1/students/${ids.student}/fee-plan`)
check('…and after every refusal the fee is as it was', r.status === 200 && r.data.totalPaisa === RS(37000), String(r.data?.totalPaisa))

r = await call('teacher', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { academicSessionId: ids.session, lines: [] })
check('a teacher cannot set a fee: 403', r.status === 403, String(r.status))
r = await get('student', `/api/v1/students/${ids.student}/fee-plan`)
check('nor can a student read one, even their own: 403', r.status === 403, String(r.status))

console.log('\nIssuing the year\n' + '-'.repeat(52))
r = await call('admin', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session, dryRun: true })
check('a dry run says what it would do and writes nothing', r.status === 200 && r.data.dryRun === true && r.data.issued === 2, `${r.status} issued=${r.data?.issued}`)
check('…adding the year up: 34,500 + 30,000', r.data?.totalBilledPaisa === RS(64500), String(r.data?.totalBilledPaisa))
r = await get('admin', `/api/v1/fees/vouchers?academicSessionId=${ids.session}`)
check('…so there is still nothing there', r.status === 200 && r.data.total === 0, `${r.data?.total}`)

// A caller that would rather come back than be cut off part way asks for a
// few at a time. The college's own migration needed this: a whole class in one
// request ran past the hosting's wall clock and answered 500 having issued
// nothing.
r = await call('admin', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session, limit: 1 })
check('a bounded run issues only as many as it was asked for', r.status === 200 && r.data.issued === 1, `${r.status} ${r.data?.issued}`)
check('…and says how many are still waiting', r.data?.remaining === 1, String(r.data?.remaining))

r = await call('admin', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session })
check('the rest of the run issues the other', r.status === 200 && r.data.issued === 1 && r.data.dryRun === false, `${r.status} ${r.data?.issued}`)
check('…with nothing left over', r.data?.remaining === 0, String(r.data?.remaining))
check('…with no due date, because families pay as they can', r.data?.dueDate === null, String(r.data?.dueDate))
r = await call('admin', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session })
check('running it again bills nobody twice', r.status === 200 && r.data.issued === 0 && r.data.skippedExisting === 2, JSON.stringify({ i: r.data?.issued, s: r.data?.skippedExisting }))
r = await get('admin', '/api/v1/audit?action=fee_voucher.issued')
check('the run is audited', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await call('teacher', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session })
check('a teacher cannot issue vouchers: 403', r.status === 403, String(r.status))

r = await get('admin', `/api/v1/fees/vouchers?academicSessionId=${ids.session}&studentId=${ids.student}`)
const voucher = r.data?.items?.[0]
check('the discounted student owes 34,500 for the year', r.status === 200 && voucher?.netPayablePaisa === RS(34500), String(voucher?.netPayablePaisa))
check('…on a voucher with a readable number', /^FV-\d{6}$/.test(voucher?.voucherNumber ?? ''), voucher?.voucherNumber)
r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check('…which keeps what it charged, head by head', r.status === 200 && r.data.lines.length === 3, `${r.data?.lines?.length}`)
check('…including the "Others" line, in the office’s words', r.data?.lines?.some((l) => l.name === 'Hostel'))

r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { academicSessionId: ids.session, lines: [{ head: 'TUITION', amountPaisa: '1000' }] })
check('changing the fee afterwards is allowed', r.status === 200, String(r.status))
r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check(
  '…and the voucher already issued follows it, head for head',
  r.status === 200 && r.data.grossPaisa === RS(1000) && r.data.lines.length === 1,
  `${r.data?.grossPaisa} lines=${r.data?.lines?.length}`,
)
check('…keeping the number the family quotes', r.data?.voucherNumber === voucher.voucherNumber, r.data?.voucherNumber)
await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, {
  academicSessionId: ids.session,
  lines: [
    { head: 'TUITION', amountPaisa: '30000' },
    { head: 'ANNUAL_FUNDS', amountPaisa: '5000' },
    { head: 'OTHER', label: 'Hostel', amountPaisa: '2000' },
  ],
  feeDiscountPaisa: '2500',
})

r = await get('admin', `/api/v1/fees/summary?academicSessionId=${ids.session}`)
check('the year adds up: 64,500 charged, nothing collected', r.status === 200 && r.data.billedPaisa === RS(64500) && r.data.collectedPaisa === 0, JSON.stringify(r.data))

console.log('\nPaying in instalments\n' + '-'.repeat(52))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '10000', paidOn: today, method: 'CASH' })
check('a first instalment is recorded', r.status === 201 && r.data.paidPaisa === RS(10000) && r.data.status === 'PARTIALLY_PAID', `${r.status} ${r.data?.status}`)
check('…and what is left is exact', r.data?.outstandingPaisa === RS(24500), String(r.data?.outstandingPaisa))
check('…with how far through the year they are', r.data?.paidPercent === 29, String(r.data?.paidPercent))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '24500', paidOn: today, method: 'BANK_TRANSFER', reference: 'SLIP-99' })
check('the last instalment settles it', r.status === 201 && r.data.status === 'PAID' && r.data.outstandingPaisa === 0, `${r.status} ${r.data?.status}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '100', paidOn: today, method: 'CASH' })
check('nothing more is taken against a settled voucher: 409', r.status === 409 && /settled in full/.test(r.error?.message ?? ''), `${r.status}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/cancel`, { reason: 'Changed my mind' })
check('and it cannot be cancelled with money on it: 409', r.status === 409 && /Void the payments first/.test(r.error?.message ?? ''), `${r.status}`)

r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
const firstPayment = r.data?.payments?.[0]
check('both instalments are on the voucher, with the office name against them', r.status === 200 && r.data.payments.length === 2 && r.data.payments[0].receivedBy, `${r.data?.payments?.length}`)
r = await call('admin', 'POST', `/api/v1/fees/payments/${firstPayment.id}/void`, { reason: 'Entered against the wrong family' })
check('voiding one puts the voucher back to part paid', r.status === 200 && r.data.paidPaisa === RS(24500) && r.data.status === 'PARTIALLY_PAID', `${r.status} ${r.data?.status}`)
r = await call('admin', 'POST', `/api/v1/fees/payments/${firstPayment.id}/void`, { reason: 'Again' })
check('a payment is not voided twice: 409', r.status === 409, String(r.status))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '1000', paidOn: '2099-01-01', method: 'CASH' })
check('a payment dated in the future → 400', r.status === 400 && /future/.test(r.error?.message ?? ''), `${r.status}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '0', paidOn: today, method: 'CASH' })
check('a payment of nothing → 400', r.status === 400, String(r.status))
r = await call('teacher', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '100', paidOn: today, method: 'CASH' })
check('a teacher cannot take money: 403', r.status === 403, String(r.status))

console.log('\nNo late fine without a due date\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check('a voucher with no due date carries no fine and is never overdue', r.data?.lateFinePaisa === 0 && r.data?.overdue === false, JSON.stringify({ f: r.data?.lateFinePaisa, o: r.data?.overdue }))

console.log('\nCancelling\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/fees/vouchers?academicSessionId=${ids.session}&studentId=${ids.studentB}`)
const second = r.data?.items?.[0]
check('the second student’s voucher has no concession on it', second?.netPayablePaisa === RS(30000), String(second?.netPayablePaisa))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${second.id}/cancel`, {})
check('cancelling without a reason → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${second.id}/cancel`, { reason: 'Issued to the wrong student' })
check('with a reason it is withdrawn, and comes to nothing', r.status === 200 && r.data.status === 'CANCELLED' && r.data.netPayablePaisa === 0, `${r.status} ${r.data?.status}`)
r = await call('admin', 'POST', '/api/v1/fees/run', { academicSessionId: ids.session })
check('a cancelled voucher can be reissued: the run picks that student up again', r.status === 200 && r.data.issued === 1, `${r.status} ${r.data?.issued}`)

console.log('\nWhat a family sees\n' + '-'.repeat(52))
r = await get('student', '/api/v1/student-portal/my-fees')
check('a student sees their own voucher and what is still owed', r.status === 200 && r.data.total === 1 && r.data.totalOutstandingPaisa === RS(10000), `${r.status} ${r.data?.totalOutstandingPaisa}`)
check('…and only their own', !r.text.includes(ids.studentB))
r = await get('student', `/api/v1/fees/vouchers/${voucher.id}`)
check('they can open their own voucher', r.status === 200 && r.data.voucherNumber === voucher.voucherNumber, String(r.status))
check('…without the office’s buttons, and without the clerk’s name', r.data?.canRecordPayment === false && r.data?.canCancel === false && r.data?.payments?.every((p) => p.receivedBy === null))
r = await get('otherStudent', `/api/v1/fees/vouchers/${voucher.id}`)
check('another student is told it does not exist: 404', r.status === 404, String(r.status))
r = await get('teacher', `/api/v1/fees/vouchers/${voucher.id}`)
check('a teacher cannot open a family’s bill: 403', r.status === 403, String(r.status))
r = await get('student', '/api/v1/fees/vouchers')
check('nor can a student read the office list: 403', r.status === 403, String(r.status))
r = await get('nobody', '/api/v1/student-portal/my-fees')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('admin', '/admin/fees')
check('the office’s fee page renders with the year added up', r.status === 200 && r.text.includes('Collected') && r.text.includes('Remaining'), String(r.status))
r = await get('admin', '/admin/fees/rules')
check('the fee rules page renders', r.status === 200 && r.text.includes('Late fine'), String(r.status))
r = await get('admin', `/admin/fees/${voucher.id}`)
check('one voucher opens for the office, itemised', r.status === 200 && r.text.includes(voucher.voucherNumber) && r.text.includes('Hostel'), String(r.status))
r = await get('admin', `/admin/students/${ids.student}`)
check('the student record carries their fee for the year', r.status === 200 && r.text.includes('School tuition fee'), String(r.status))
r = await get('admin', '/admin/students/new')
check('the admission form offers every fee head, and the documents', r.status === 200 && r.text.includes('Fees for the year') && r.text.includes('Board registration fee') && r.text.includes('Documents'), String(r.status))
r = await get('admin', '/admin/staff/new')
check('the staff form asks for a salary', r.status === 200 && r.text.includes('Salary per month'), String(r.status))
r = await get('student', '/student/fees')
check('the student’s own page renders', r.status === 200 && r.text.includes('Still to pay'), String(r.status))
r = await get('student', `/student/fees/${voucher.id}`)
check('…and their own voucher opens', r.status === 200, String(r.status))
r = await get('otherStudent', `/student/fees/${voucher.id}`)
check('somebody else’s gives them a 404 page', r.status === 404, String(r.status))
for (const who of ['teacher', 'student', 'nobody']) {
  r = await get(who, '/admin/fees')
  check(`${who} is sent away from the office’s fee page`, r.status === 307, String(r.status))
}

/*
 * Adding a fund to a student who has already been billed and has already paid.
 *
 * This is the college's own case: the intake was migrated with its vouchers
 * already issued, and a fund decided afterwards has to reach the bill the
 * family is handed or it is never collected. Last in the file, so nothing
 * above has to be reasoned about twice.
 */
console.log('\nA fund added after the voucher went out\n' + '-'.repeat(52))

r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
const beforeAdd = {
  number: r.data?.voucherNumber,
  gross: r.data?.grossPaisa,
  paid: r.data?.paidPaisa,
  outstanding: r.data?.outstandingPaisa,
  payments: (r.data?.payments ?? []).length,
}
check(
  'the student has a voucher with money already against it',
  beforeAdd.paid === RS(24500) && beforeAdd.outstanding === RS(10000),
  JSON.stringify(beforeAdd),
)

r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, {
  academicSessionId: ids.session,
  lines: [
    { head: 'TUITION', amountPaisa: '30000' },
    { head: 'ANNUAL_FUNDS', amountPaisa: '5000' },
    { head: 'OTHER', label: 'Hostel', amountPaisa: '2000' },
    { head: 'EVENTS_FUNDS', amountPaisa: '1200' },
  ],
  feeDiscountPaisa: '2500',
})
check('the office adds an events fund to the year', r.status === 200 && r.data?.totalPaisa === RS(38200), `${r.status} ${r.data?.totalPaisa}`)

r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check('the fund is on the voucher', r.status === 200 && r.data.lines.length === 4 && r.data.lines.some((l) => l.head === 'EVENTS_FUNDS'), `${r.data?.lines?.length}`)
check('…the year charged is 38,200 less the 2,500 concession', r.data?.grossPaisa === RS(38200) && r.data?.netPayablePaisa === RS(35700), JSON.stringify({ g: r.data?.grossPaisa, n: r.data?.netPayablePaisa }))
check('…what was paid is untouched', r.data?.paidPaisa === beforeAdd.paid && (r.data?.payments ?? []).length === beforeAdd.payments, JSON.stringify({ p: r.data?.paidPaisa, n: r.data?.payments?.length }))
check('…what is left has gone up by the fund, to the rupee', r.data?.outstandingPaisa === RS(11200), String(r.data?.outstandingPaisa))
check('…and the number the family quotes has not changed', r.data?.voucherNumber === beforeAdd.number, r.data?.voucherNumber)
check('…and it is still part paid rather than settled', r.data?.status === 'PARTIALLY_PAID', r.data?.status)

r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check('the new head is named as the office reads it', r.data?.lines?.some((l) => l.name === 'Events funds'), JSON.stringify(r.data?.lines?.map((l) => l.name)))

r = await get('student', `/api/v1/fees/vouchers/${voucher.id}`)
check('the family sees the new amount on their own voucher', r.status === 200 && r.data?.outstandingPaisa === RS(11200), `${r.status} ${r.data?.outstandingPaisa}`)

r = await get('admin', '/api/v1/audit?action=fee_voucher.rebilled')
check('the change to the voucher is audited', r.status === 200 && (r.data?.total ?? 0) >= 1, String(r.data?.total))
r = await get('admin', `/api/v1/audit/${r.data?.items?.[0]?.id}`)
check(
  '…naming what was charged before and after',
  (r.data?.changes ?? []).some((c) => /gross/i.test(c.field)),
  JSON.stringify((r.data?.changes ?? []).map((c) => c.field)),
)

// Taking a head away again works the same way, so the office can undo a
// mistake without cancelling a voucher that has money on it.
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, {
  academicSessionId: ids.session,
  lines: [
    { head: 'TUITION', amountPaisa: '30000' },
    { head: 'ANNUAL_FUNDS', amountPaisa: '5000' },
    { head: 'OTHER', label: 'Hostel', amountPaisa: '2000' },
  ],
  feeDiscountPaisa: '2500',
})
r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
check('removing it again puts the voucher back', r.data?.grossPaisa === RS(37000) && r.data?.lines?.length === 3, JSON.stringify({ g: r.data?.grossPaisa, l: r.data?.lines?.length }))
check('…with the payments still on it', r.data?.paidPaisa === beforeAdd.paid && r.data?.outstandingPaisa === RS(10000), JSON.stringify({ p: r.data?.paidPaisa, o: r.data?.outstandingPaisa }))

r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/cancel`, { reason: 'To prove a withdrawn voucher is left alone' })
check('a voucher with money on it still cannot be cancelled', r.status === 409, String(r.status))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

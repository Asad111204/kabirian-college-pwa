/**
 * Phase 25: fees. Packages, plans, a month's vouchers, money in, and the
 * arithmetic checked to the paisa. Through the PRODUCTION build.
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
const thisMonth = `${today.slice(0, 7)}-01`
const RS = (rupees) => rupees * 100

await login('admin', 'harness.admin')
await login('teacher', 'harness.teacher.a')
await login('student', 'harness.student')
await login('otherStudent', 'harness.student.b')

console.log('\nPackages and rules\n' + '-'.repeat(52))
let r = await call('admin', 'PUT', '/api/v1/fees/rules', { dueDayOfMonth: 10, lateFinePaisa: '500' })
check('the office sets the due day and the late fine', r.status === 200 && r.data.dueDayOfMonth === 10 && r.data.lateFinePaisa === RS(500), `${r.status} ${JSON.stringify(r.data)}`)
r = await get('teacher', '/api/v1/fees/rules')
check('a teacher cannot read the fee rules: 403', r.status === 403, String(r.status))
r = await call('student', 'PUT', '/api/v1/fees/rules', { dueDayOfMonth: 1, lateFinePaisa: 0 })
check('a student cannot change them: 403', r.status === 403, String(r.status))

r = await call('admin', 'POST', '/api/v1/fees/packages', { name: 'Harness Regular', monthlyAmountPaisa: '12,500' })
const regular = r.data?.id
check('a package is created, and rupees are stored as paisa', r.status === 201 && r.data.monthlyAmountPaisa === RS(12500), `${r.status} ${r.data?.monthlyAmountPaisa}`)
r = await call('admin', 'POST', '/api/v1/fees/packages', { name: 'Harness Regular', monthlyAmountPaisa: '9000' })
check('two packages cannot share a name: 409', r.status === 409, String(r.status))
r = await call('admin', 'POST', '/api/v1/fees/packages', { name: 'Harness Nonsense', monthlyAmountPaisa: '-100' })
check('a negative amount → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', '/api/v1/fees/packages', { name: 'Harness Typo', monthlyAmountPaisa: '99999999' })
check('an amount with an extra zero → 400', r.status === 400, String(r.status))
r = await call('teacher', 'POST', '/api/v1/fees/packages', { name: 'From a teacher', monthlyAmountPaisa: '100' })
check('a teacher cannot create one: 403', r.status === 403, String(r.status))

r = await call('admin', 'POST', '/api/v1/fees/packages', { name: 'Harness Retired', monthlyAmountPaisa: '4000', isActive: false })
const retired = r.data?.id
check('a retired package can exist for the old vouchers that point at it', r.status === 201 && r.data.isActive === false, String(r.status))

console.log('\nPutting students on a plan\n' + '-'.repeat(52))
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { feePackageId: regular, feeDiscountPaisa: '2500' })
check('the office puts a student on a package with a concession', r.status === 200 && r.data.monthlyPayablePaisa === RS(10000), `${r.status} ${r.data?.monthlyPayablePaisa}`)
r = await call('admin', 'PUT', `/api/v1/students/${ids.studentB}/fee-plan`, { feePackageId: regular, feeDiscountPaisa: 0 })
check('and another on the same package with none', r.status === 200 && r.data.monthlyPayablePaisa === RS(12500), `${r.status} ${r.data?.monthlyPayablePaisa}`)
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { feePackageId: retired, feeDiscountPaisa: 0 })
check('nobody is put on a retired package: 400', r.status === 400 && /no longer in use/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { feePackageId: regular, feeDiscountPaisa: '2500' })
check('…and the student is left as they were', r.status === 200 && r.data.feeDiscountPaisa === RS(2500))
r = await call('teacher', 'PUT', `/api/v1/students/${ids.student}/fee-plan`, { feePackageId: regular })
check('a teacher cannot set a fee plan: 403', r.status === 403, String(r.status))
r = await get('student', `/api/v1/students/${ids.student}/fee-plan`)
check('nor can a student read one, even their own: 403', r.status === 403, String(r.status))

console.log('\nIssuing the month\n' + '-'.repeat(52))
r = await call('admin', 'POST', '/api/v1/fees/run', { month: thisMonth, dryRun: true })
check('a dry run says what it would do and writes nothing', r.status === 200 && r.data.dryRun === true && r.data.issued === 2, `${r.status} issued=${r.data?.issued}`)
check('…and adds the month up: 10,000 + 12,500', r.data?.totalBilledPaisa === RS(22500), String(r.data?.totalBilledPaisa))
r = await get('admin', `/api/v1/fees/vouchers?month=${thisMonth}`)
check('…so there is still nothing there', r.status === 200 && r.data.total === 0, `${r.data?.total}`)

r = await call('admin', 'POST', '/api/v1/fees/run', { month: thisMonth })
check('the run issues one voucher each', r.status === 200 && r.data.issued === 2 && r.data.dryRun === false, `${r.status} ${r.data?.issued}`)
check('…due on the day the office set', (r.data?.dueDate ?? '').endsWith('-10'), r.data?.dueDate)
r = await call('admin', 'POST', '/api/v1/fees/run', { month: thisMonth })
check('running it again bills nobody twice', r.status === 200 && r.data.issued === 0 && r.data.skippedExisting === 2, `${r.status} ${JSON.stringify({ i: r.data?.issued, s: r.data?.skippedExisting })}`)
r = await get('admin', '/api/v1/audit?action=fee_voucher.issued')
check('the run is audited', r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
r = await call('teacher', 'POST', '/api/v1/fees/run', { month: thisMonth })
check('a teacher cannot issue vouchers: 403', r.status === 403, String(r.status))

r = await get('admin', `/api/v1/fees/vouchers?month=${thisMonth}&studentId=${ids.student}`)
const voucher = r.data?.items?.[0]
check('the discounted student owes 10,000, not 12,500', r.status === 200 && voucher?.netPayablePaisa === RS(10000) && voucher?.grossPaisa === RS(12500) && voucher?.discountPaisa === RS(2500), JSON.stringify(voucher?.netPayablePaisa))
check('…on a voucher with a readable number', /^FV-\d{6}$/.test(voucher?.voucherNumber ?? ''), voucher?.voucherNumber)
r = await get('admin', `/api/v1/fees/summary?month=${thisMonth}`)
check('the month summary adds up: 22,500 billed, nothing collected', r.status === 200 && r.data.billedPaisa === RS(22500) && r.data.collectedPaisa === 0 && r.data.outstandingPaisa === RS(22500), JSON.stringify(r.data))

console.log('\nMoney in\n' + '-'.repeat(52))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '4000', paidOn: today, method: 'CASH' })
check('a part payment is recorded', r.status === 201 && r.data.paidPaisa === RS(4000) && r.data.status === 'PARTIALLY_PAID', `${r.status} ${r.data?.status}`)
check('…and what is left is exact', r.data?.outstandingPaisa === RS(6000), String(r.data?.outstandingPaisa))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '6000', paidOn: today, method: 'BANK_TRANSFER', reference: 'SLIP-99' })
check('the rest settles it', r.status === 201 && r.data.status === 'PAID' && r.data.outstandingPaisa === 0, `${r.status} ${r.data?.status}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '100', paidOn: today, method: 'CASH' })
check('nothing more is taken against a settled voucher: 409', r.status === 409 && /settled in full/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/cancel`, { reason: 'Changed my mind' })
check('and it cannot be cancelled with money on it: 409', r.status === 409 && /Void the payments first/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)

r = await get('admin', `/api/v1/fees/vouchers/${voucher.id}`)
const firstPayment = r.data?.payments?.[0]
check('both payments are on the voucher, with the office name against them', r.status === 200 && r.data.payments.length === 2 && r.data.payments[0].receivedBy, `${r.data?.payments?.length}`)
r = await call('admin', 'POST', `/api/v1/fees/payments/${firstPayment.id}/void`, { reason: 'Entered against the wrong family' })
check('voiding one puts the voucher back to part paid', r.status === 200 && r.data.paidPaisa === RS(6000) && r.data.status === 'PARTIALLY_PAID', `${r.status} ${r.data?.status}`)
check('…and the voided payment is kept, marked, with its reason', r.data?.payments?.find((p) => p.id === firstPayment.id)?.voidReason === 'Entered against the wrong family')
r = await call('admin', 'POST', `/api/v1/fees/payments/${firstPayment.id}/void`, { reason: 'Again' })
check('a payment is not voided twice: 409', r.status === 409, String(r.status))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '1000', paidOn: '2099-01-01', method: 'CASH' })
check('a payment dated in the future → 400', r.status === 400 && /future/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '0', paidOn: today, method: 'CASH' })
check('a payment of nothing → 400', r.status === 400, String(r.status))
r = await call('teacher', 'POST', `/api/v1/fees/vouchers/${voucher.id}/payments`, { amountPaisa: '100', paidOn: today, method: 'CASH' })
check('a teacher cannot take money: 403', r.status === 403, String(r.status))
for (const action of ['fee_payment.recorded', 'fee_payment.voided']) {
  r = await get('admin', `/api/v1/audit?action=${action}`)
  check(`${action} is audited`, r.status === 200 && r.data.total >= 1, `${r.data?.total}`)
}

console.log('\nCancelling\n' + '-'.repeat(52))
r = await get('admin', `/api/v1/fees/vouchers?month=${thisMonth}&studentId=${ids.studentB}`)
const second = r.data?.items?.[0]
check('the second student’s voucher has no concession on it', second?.netPayablePaisa === RS(12500), String(second?.netPayablePaisa))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${second.id}/cancel`, {})
check('cancelling without a reason → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${second.id}/cancel`, { reason: 'Issued to the wrong student' })
check('with a reason it is withdrawn, and comes to nothing', r.status === 200 && r.data.status === 'CANCELLED' && r.data.netPayablePaisa === 0, `${r.status} ${r.data?.status}`)
r = await call('admin', 'POST', `/api/v1/fees/vouchers/${second.id}/payments`, { amountPaisa: '100', paidOn: today, method: 'CASH' })
check('nothing is taken against a cancelled voucher: 409', r.status === 409, String(r.status))
r = await call('admin', 'POST', '/api/v1/fees/run', { month: thisMonth })
check('a cancelled voucher can be reissued: the run picks that student up again', r.status === 200 && r.data.issued === 1, `${r.status} ${r.data?.issued}`)

console.log('\nWhat a family sees\n' + '-'.repeat(52))
r = await get('student', '/api/v1/student-portal/my-fees')
check('a student sees their own voucher and what is still owed', r.status === 200 && r.data.total === 1 && r.data.totalOutstandingPaisa === RS(4000), `${r.status} ${r.data?.totalOutstandingPaisa}`)
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
r = await get('teacher', '/api/v1/student-portal/my-fees')
check('a teacher has no fees of their own: 403', r.status === 403, String(r.status))
r = await get('nobody', '/api/v1/student-portal/my-fees')
check('signed out → 401', r.status === 401, String(r.status))

console.log('\nThe screens\n' + '-'.repeat(52))
r = await get('admin', '/admin/fees')
check('the office’s fee page renders with the month added up', r.status === 200 && r.text.includes('Outstanding'), String(r.status))
r = await get('admin', '/admin/fees/packages')
check('packages and rules render, in rupees', r.status === 200 && r.text.includes('Rs 12,500'), String(r.status))
r = await get('admin', `/admin/fees/${voucher.id}`)
check('one voucher opens for the office', r.status === 200 && r.text.includes(voucher.voucherNumber), String(r.status))
r = await get('admin', `/admin/students/${ids.student}`)
check('the student record carries their fee plan', r.status === 200 && r.text.includes('Harness Regular'), String(r.status))
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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

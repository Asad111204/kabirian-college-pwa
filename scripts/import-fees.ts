/**
 * Brings the old college system's fee ledger into this one, through the
 * running application.
 *
 *   npx tsx scripts/import-fees.ts --plans old-fee-plans.csv --payments old-fee-payments.csv --url https://college.example.com
 *   …same again with --apply once the report reads correctly.
 *
 * Without `--apply` nothing is created: every row is matched to a student and
 * checked, and the report says what would happen. With `--apply` the work goes
 * through the same endpoints the office's own screens use, so every rule holds
 * and the whole run appears in the audit log under the administrator who ran
 * it.
 *
 * Three steps, in this order:
 *
 *   1. each student's fee for the year is set, head by head, with the old
 *      system's concession as their discount;
 *   2. the session's vouchers are issued — one per student, exactly what the
 *      "Issue vouchers" button does;
 *   3. every payment already received is recorded against that voucher, on the
 *      date the old system recorded it.
 *
 * Amounts in the CSV are rupees, as the old system holds them; this converts
 * to paisa, which is how money is stored here.
 *
 * A voucher that already has money against it is left alone unless --force is
 * given, so running this twice cannot record the same payment twice.
 *
 * The administrator's password is asked for on the terminal and never written
 * anywhere.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { parseCsv, normaliseHeader } from '../src/lib/csv-read'

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/**
 * Asks for something without putting it on the screen.
 *
 * A terminal echoes what is typed, which puts the administrator's password in
 * the scrollback — and in any screenshot of it. Once the prompt itself is
 * written, everything after is swallowed.
 */
async function askSecret(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  const internals = rl as unknown as { _writeToOutput?: (text: string) => void }
  const original = internals._writeToOutput
  const pending = rl.question(prompt)
  internals._writeToOutput = () => {}
  try {
    return await pending
  } finally {
    internals._writeToOutput = original
    stdout.write('\n')
  }
}

/** Rupees in the old system, paisa here. */
const toPaisa = (rupees: string): number => Math.round(Number(rupees) * 100)
const rupees = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK')}`

interface PlanRow {
  line: number
  admissionNumber: string
  fullName: string
  tuition: number
  concession: number
  annualFunds: number
  eventsFunds: number
}

interface PaymentRow {
  line: number
  admissionNumber: string
  fullName: string
  paidOn: string
  amountPaisa: number
  month: string
}

/** Reads a CSV into rows keyed by their (normalised) header names. */
function readRows(file: string): { header: string[]; rows: Record<string, string>[] } {
  const parsed = parseCsv(readFileSync(file, 'utf8'))
  const header = (parsed.shift() ?? []).map(normaliseHeader)
  const rows = parsed.map((cells) => {
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = (cells[i] ?? '').trim()
    })
    return row
  })
  return { header, rows }
}

async function main() {
  const plansFile = argValue('--plans')
  const paymentsFile = argValue('--payments')
  const url = (argValue('--url') ?? 'http://localhost:3000').replace(/\/$/, '')
  const apply = process.argv.includes('--apply')
  const force = process.argv.includes('--force')
  const skipVouchers = process.argv.includes('--no-vouchers')

  if (!plansFile) {
    console.error('\nGive the plans CSV: --plans old-fee-plans.csv [--payments old-fee-payments.csv] [--url https://…] [--apply]\n')
    process.exit(1)
  }

  const plans: PlanRow[] = readRows(plansFile).rows.map((row, i) => ({
    line: i + 2,
    admissionNumber: row.admission_number ?? '',
    fullName: row.full_name ?? '',
    tuition: toPaisa(row.tuition || '0'),
    concession: toPaisa(row.concession || '0'),
    annualFunds: toPaisa(row.annual_funds || '0'),
    eventsFunds: toPaisa(row.events_funds || '0'),
  }))

  const payments: PaymentRow[] = paymentsFile
    ? readRows(paymentsFile).rows.map((row, i) => ({
        line: i + 2,
        admissionNumber: row.admission_number ?? '',
        fullName: row.full_name ?? '',
        paidOn: row.paid_on ?? '',
        amountPaisa: toPaisa(row.amount || '0'),
        month: row.month ?? '',
      }))
    : []

  // Asked on the terminal; the harness drill supplies them through the
  // environment instead. Neither is ever written anywhere.
  let username = process.env.KC_ADMIN_USERNAME ?? ''
  let password = process.env.KC_ADMIN_PASSWORD ?? ''
  if (!username || !password) {
    const rl = createInterface({ input: stdin, output: stdout })
    username = await rl.question('Administrator username: ')
    password = await askSecret(rl, 'Password (not shown as you type): ')
    rl.close()
  }

  const loginRes = await fetch(`${url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  })
  const cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  if (!cookie.startsWith('kc_session=')) {
    console.error(`\nSign-in failed (${loginRes.status}).\n`)
    process.exit(1)
  }
  const headers = { cookie, origin: url, 'content-type': 'application/json' }

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${url}${path}`, { headers })
    const body = (await res.json()) as { data?: T; error?: { message?: string } }
    if (!res.ok) throw new Error(`${path}: ${body.error?.message ?? res.status}`)
    return body.data as T
  }

  const sessions = await get<{ items?: { id: string; name: string; isCurrent: boolean }[] } | { id: string; name: string; isCurrent: boolean }[]>(
    '/api/v1/academics/sessions',
  )
  const sessionList = Array.isArray(sessions) ? sessions : (sessions.items ?? [])
  const current = sessionList.find((s) => s.isCurrent)
  if (!current) {
    console.error('\nNo current academic session is set.\n')
    process.exit(1)
  }

  // Everyone at once rather than a lookup per row: two requests instead of
  // two hundred.
  const byAdmissionNumber = new Map<string, { id: string; fullName: string }>()
  for (let page = 1; page < 50; page += 1) {
    const body = await get<{ items: { id: string; fullName: string; admissionNumber: string }[]; totalPages: number }>(
      `/api/v1/students?page=${page}&pageSize=100&status=ALL`,
    )
    for (const student of body.items) byAdmissionNumber.set(student.admissionNumber, { id: student.id, fullName: student.fullName })
    if (page >= (body.totalPages ?? 1)) break
  }

  console.log(`\nFees into session ${current.name}${apply ? '' : ' — DRY RUN, nothing will be created'}`)
  console.log(`  ${byAdmissionNumber.size} students in the system to match against\n`)

  const problems: string[] = []

  /* ---------------------------------------------------------------- plans */

  let plansOk = 0
  let charged = 0
  for (const plan of plans) {
    const student = byAdmissionNumber.get(plan.admissionNumber)
    if (!student) {
      problems.push(`plans line ${plan.line} (${plan.fullName}): no student with admission number ${plan.admissionNumber}`)
      continue
    }
    if (plan.concession > plan.tuition + plan.annualFunds + plan.eventsFunds) {
      problems.push(`plans line ${plan.line} (${plan.fullName}): the concession is larger than the whole fee`)
      continue
    }

    const lines = [
      { head: 'TUITION', amountPaisa: plan.tuition },
      { head: 'ANNUAL_FUNDS', amountPaisa: plan.annualFunds },
      { head: 'EVENTS_FUNDS', amountPaisa: plan.eventsFunds },
    ].filter((line) => line.amountPaisa > 0)

    if (apply) {
      const res = await fetch(`${url}/api/v1/students/${student.id}/fee-plan`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ academicSessionId: current.id, lines, feeDiscountPaisa: plan.concession }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string; fields?: Record<string, string[]> } }
        problems.push(`plans line ${plan.line} (${plan.fullName}): ${body.error?.message ?? res.status}`)
        continue
      }
    }
    plansOk += 1
    charged += plan.tuition + plan.annualFunds + plan.eventsFunds - plan.concession
    if (apply && plansOk % 25 === 0) console.log(`  ${plansOk} fee plans set…`)
  }
  console.log(`  ${apply ? 'Set' : 'Would set'} ${plansOk} fee plan${plansOk === 1 ? '' : 's'} — ${rupees(charged)} charged for the year.`)

  /* ------------------------------------------------------------- vouchers */

  if (apply && !skipVouchers && plansOk > 0) {
    const res = await fetch(`${url}/api/v1/fees/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ academicSessionId: current.id }),
    })
    const body = (await res.json()) as { data?: { issued: number; skippedExisting: number; skippedNoFee: number; totalBilledPaisa: number }; error?: { message?: string } }
    if (!res.ok) {
      console.error(`\nIssuing vouchers failed: ${body.error?.message ?? res.status}\n`)
      process.exit(1)
    }
    console.log(
      `  Issued ${body.data?.issued ?? 0} voucher(s); ${body.data?.skippedExisting ?? 0} already had one, ${body.data?.skippedNoFee ?? 0} have no fee set. ` +
        `${rupees(body.data?.totalBilledPaisa ?? 0)} billed.`,
    )
  } else if (!apply) {
    console.log('  Would issue one voucher per student with a fee, the same as the "Issue vouchers" button.')
  }

  /* ------------------------------------------------------------- payments */

  let paymentsOk = 0
  let received = 0
  if (payments.length > 0) {
    // What was on each voucher *before* this run. Families here pay in
    // instalments, so one student can have several payments in the file, and
    // the guard below must not mistake this run's own first payment for
    // somebody else's earlier work.
    const voucherOf = new Map<string, { id: string; paidBeforePaisa: number }>()
    if (apply) {
      for (let page = 1; page < 50; page += 1) {
        const body = await get<{ items: { id: string; studentId: string; paidPaisa: number }[]; totalPages: number }>(
          `/api/v1/fees/vouchers?page=${page}&pageSize=100&academicSessionId=${current.id}`,
        )
        for (const voucher of body.items) voucherOf.set(voucher.studentId, { id: voucher.id, paidBeforePaisa: voucher.paidPaisa })
        if (page >= (body.totalPages ?? 1)) break
      }
    }

    for (const payment of payments) {
      const student = byAdmissionNumber.get(payment.admissionNumber)
      if (!student) {
        problems.push(`payments line ${payment.line} (${payment.fullName}): no student with admission number ${payment.admissionNumber}`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.paidOn)) {
        problems.push(`payments line ${payment.line} (${payment.fullName}): "${payment.paidOn}" is not a date`)
        continue
      }
      if (payment.amountPaisa <= 0) {
        problems.push(`payments line ${payment.line} (${payment.fullName}): the amount is not positive`)
        continue
      }

      if (!apply) {
        paymentsOk += 1
        received += payment.amountPaisa
        continue
      }

      const voucher = voucherOf.get(student.id)
      if (!voucher) {
        problems.push(`payments line ${payment.line} (${payment.fullName}): they have no voucher for ${current.name}`)
        continue
      }
      // Money that was on the voucher before this run means somebody has been
      // here already — this script on an earlier day, or the office at the
      // counter. Leave the whole student alone rather than doubling a receipt.
      if (voucher.paidBeforePaisa > 0 && !force) {
        problems.push(
          `payments line ${payment.line} (${payment.fullName}): their voucher already had ${rupees(voucher.paidBeforePaisa)} against it, left alone`,
        )
        continue
      }

      const res = await fetch(`${url}/api/v1/fees/vouchers/${voucher.id}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amountPaisa: payment.amountPaisa,
          paidOn: payment.paidOn,
          method: 'CASH',
          remarks: `Carried over from the previous college system (${payment.month}).`,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        problems.push(`payments line ${payment.line} (${payment.fullName}): ${body.error?.message ?? res.status}`)
        continue
      }
      paymentsOk += 1
      received += payment.amountPaisa
    }
    console.log(`  ${apply ? 'Recorded' : 'Would record'} ${paymentsOk} payment${paymentsOk === 1 ? '' : 's'} — ${rupees(received)} received.`)
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} row${problems.length === 1 ? '' : 's'} with problems:`)
    for (const problem of problems) console.log(`  - ${problem}`)
  }
  console.log('')
  // Let the process end on its own: process.exit() here trips a libuv
  // assertion on Windows while fetch's sockets are still closing.
  process.exitCode = problems.length > 0 ? 1 : 0
}

main().catch((error) => {
  console.error('\nImport failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

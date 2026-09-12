/**
 * Brings a previous fee ledger (two CSV files) into this system, through the
 * running application.
 *
 *   npx tsx scripts/import-fees.ts --plans fee-plans.csv --payments fee-payments.csv --url https://school.example.com
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
 * given, so running this twice cannot record the same payment twice. All three
 * steps skip what is already done, so an interrupted run is finished by
 * running it again; `--no-plans` skips the first step outright when the plans
 * are known to be right already.
 *
 * The administrator's password is asked for on the terminal and never written
 * anywhere.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { askCredentials } from './prompt'
import { parseCsv, normaliseHeader } from '../src/lib/csv-read'

/**
 * Everything this run said, kept as well as printed.
 *
 * A terminal scrolls, a window gets closed, and "it did not work" is not
 * something anybody can act on. Every line goes to a report file as well as
 * the screen, including the line where it gave up, so what happened can be
 * read afterwards. No password ever passes through here — the only thing that
 * asks for one writes nothing.
 */
const transcript: string[] = []

function say(line = ''): void {
  transcript.push(line)
  console.log(line)
}

function complain(line: string): void {
  transcript.push(line)
  console.error(line)
}

/**
 * A request that survives the network having a bad moment.
 *
 * This talks to a hosted application over the open internet, several hundred
 * times in a row, and one dropped connection was enough to end a run that had
 * done almost all of its work — "fetch failed", with a third of the payments
 * still to record. A refusal from the server is an answer and is returned as
 * it is; only a connection that never produced one is worth trying again.
 */
async function request(input: string, init?: RequestInit, attempts = 4): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      // A short, growing wait: a moment for whatever it was to pass.
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const NEWLINE = String.fromCharCode(10)

function writeReport(path: string): void {
  try {
    writeFileSync(path, transcript.join(NEWLINE) + NEWLINE, 'utf8')
    console.log(`${NEWLINE}A copy of this run is in ${path}${NEWLINE}`)
  } catch {
    // A report that cannot be written is not worth failing the run over.
  }
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** Rupees in the old system, paisa here. */
const toPaisa = (rupees: string): number => Math.round(Number(rupees) * 100)
const rupees = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK')}`

interface OptionGroup {
  sections: { id: string; name: string }[]
}

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
  // A run that was interrupted has the plans already: they are set by a PUT
  // that replaces, so re-sending them changes nothing but costs a request each.
  const skipPlans = process.argv.includes('--no-plans')

  if (!plansFile) {
    complain('\nGive the plans CSV: --plans fee-plans.csv [--payments fee-payments.csv] [--url https://…] [--no-plans] [--apply]\n')
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

  const { username, password } = await askCredentials()

  const loginRes = await request(`${url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  })
  const cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  if (!cookie.startsWith('kc_session=')) {
    complain(`\nSign-in failed (${loginRes.status}). Check the username and password.\n`)
    process.exit(1)
  }
  const headers = { cookie, origin: url, 'content-type': 'application/json' }

  const get = async <T>(path: string): Promise<T> => {
    const res = await request(`${url}${path}`, { headers })
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
    complain('\nNo current academic session is set.\n')
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

  say(`\nFees into session ${current.name}${apply ? '' : ' — DRY RUN, nothing will be created'}`)
  say(`  ${byAdmissionNumber.size} students in the system to match against\n`)

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

    if (apply && !skipPlans) {
      const res = await request(`${url}/api/v1/students/${student.id}/fee-plan`, {
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
    if (apply && plansOk % 25 === 0) say(`  ${plansOk} fee plans set…`)
  }
  say(
    skipPlans && apply
      ? `  Left ${plansOk} fee plan${plansOk === 1 ? '' : 's'} as they are — ${rupees(charged)} charged for the year.`
      : `  ${apply ? 'Set' : 'Would set'} ${plansOk} fee plan${plansOk === 1 ? '' : 's'} — ${rupees(charged)} charged for the year.`,
  )

  /* ------------------------------------------------------------- vouchers */

  if (apply && !skipVouchers && plansOk > 0) {
    // A few students per request, section by section, until nothing is left.
    //
    // A hosted request has a wall clock, and a whole class at once runs past
    // it: the school's own sections of eleven went through while those of
    // seventeen, twenty and twenty-nine came back as 500s having issued
    // nothing. So each call is bounded, and the reply says how many are still
    // waiting. Anyone who already has a voucher is skipped, so asking again
    // simply continues — there is no way to bill a student twice by repeating
    // this. The sweep at the end catches anyone not in a section at all.
    const AT_A_TIME = 10
    const groups = await get<OptionGroup[]>(`/api/v1/students/enrollment-options?sessionId=${current.id}`)
    const sectionIds = groups.flatMap((group) => group.sections.map((section) => section.id))

    let issued = 0
    let billed = 0

    /** Keeps asking for the same scope until the server says nothing is left. */
    const issueVouchers = async (scope: Record<string, unknown>, what: string) => {
      // A ceiling on the rounds, so a server that always reports work left
      // cannot spin here for ever.
      for (let round = 0; round < 60; round += 1) {
        const res = await request(`${url}/api/v1/fees/run`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...scope, academicSessionId: current.id, limit: AT_A_TIME }),
        })
        const json = (await res.json()) as {
          data?: { issued: number; totalBilledPaisa: number; remaining: number }
          error?: { message?: string }
        }
        if (!res.ok) {
          problems.push(`vouchers for ${what}: ${json.error?.message ?? res.status}`)
          return
        }
        issued += json.data?.issued ?? 0
        billed += json.data?.totalBilledPaisa ?? 0
        if ((json.data?.remaining ?? 0) === 0) return
      }
      problems.push(`vouchers for ${what}: still not finished after 60 rounds`)
    }

    for (const [at, sectionId] of sectionIds.entries()) await issueVouchers({ sectionId }, `section ${at + 1}`)
    await issueVouchers({}, 'the rest of the session')

    say(`  Issued ${issued} voucher${issued === 1 ? '' : 's'} — ${rupees(billed)} billed.`)
  } else if (!apply) {
    say('  Would issue one voucher per student with a fee, the same as the "Issue vouchers" button.')
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

      // One receipt that will not go through is a problem to report, not a
      // reason to abandon the thirty after it. Whatever this run does record
      // stands, and running again picks up the rest.
      try {
        const res = await request(`${url}/api/v1/fees/vouchers/${voucher.id}/payments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            amountPaisa: payment.amountPaisa,
            paidOn: payment.paidOn,
            method: 'CASH',
            remarks: `Carried over from the previous fee system (${payment.month}).`,
          }),
        })
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } }
          problems.push(`payments line ${payment.line} (${payment.fullName}): ${body.error?.message ?? res.status}`)
          continue
        }
      } catch (error) {
        problems.push(
          `payments line ${payment.line} (${payment.fullName}): ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }
      paymentsOk += 1
      received += payment.amountPaisa
    }
    say(`  ${apply ? 'Recorded' : 'Would record'} ${paymentsOk} payment${paymentsOk === 1 ? '' : 's'} — ${rupees(received)} received.`)
  }

  if (problems.length > 0) {
    say(`\n${problems.length} row${problems.length === 1 ? '' : 's'} with problems:`)
    for (const problem of problems) say(`  - ${problem}`)
  }
  say('')
  // Let the process end on its own: process.exit() here trips a libuv
  // assertion on Windows while fetch's sockets are still closing.
  process.exitCode = problems.length > 0 ? 1 : 0
}

const reportPath = argValue('--report') ?? 'fee-import-report.txt'

main()
  .then(() => writeReport(reportPath))
  .catch((error) => {
    // Where it gave up, written down rather than only shown on a screen that
    // scrolls: this is the line that says why nothing happened.
    complain(`\nImport failed: ${error instanceof Error ? error.message : String(error)}`)
    if (error instanceof Error && error.stack) transcript.push(error.stack)
    writeReport(reportPath)
    process.exitCode = 1
  })

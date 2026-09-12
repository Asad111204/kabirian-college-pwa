/**
 * Reads the old college system's fee ledger into two CSV files.
 *
 *   npx tsx scripts/convert-old-fees.ts
 *
 * The old system keeps one row per student per session in `installment.DBF`:
 * the year's tuition (FEE), any concession (CONC), the annual and events
 * funds, and then twelve months of columns — how much was asked for, how much
 * came in, and on what date. That is the same shape as this system's annual
 * fee: heads that make up the year's charge, paid in instalments whenever the
 * family can (ADR-177).
 *
 * Two files come out, so a person can read each on its own:
 *
 *   old-fee-plans.csv     what each student is charged for the year
 *   old-fee-payments.csv  every payment already received, with its date
 *
 * Amounts are written in rupees, as the old system holds them. Nothing here
 * writes to the database; feed the files to scripts/import-fees.ts next.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* -------------------------------------------------------------------------- */

type DbfRow = Record<string, string | number | boolean | null>

/** Reads a .DBF into plain rows; a record marked deleted is skipped. */
function readDbf(path: string): DbfRow[] {
  const buf = readFileSync(path)
  const recordCount = buf.readUInt32LE(4)
  const headerLength = buf.readUInt16LE(8)
  const recordLength = buf.readUInt16LE(10)

  const fields: { name: string; type: string; size: number }[] = []
  for (let at = 32; at < headerLength - 1; at += 32) {
    if (buf[at] === 0x0d) break
    const name = buf.subarray(at, at + 11).toString('latin1').replace(/\0.*$/, '').trim()
    if (!name) break
    fields.push({ name, type: String.fromCharCode(buf[at + 11]!), size: buf[at + 16]! })
  }

  const rows: DbfRow[] = []
  for (let i = 0; i < recordCount; i += 1) {
    const start = headerLength + i * recordLength
    if (start + recordLength > buf.length) break
    if (buf[start] === 0x2a) continue

    const row: DbfRow = {}
    let at = start + 1
    for (const field of fields) {
      const raw = buf.subarray(at, at + field.size).toString('latin1').trim()
      at += field.size
      if (field.type === 'N' || field.type === 'F') row[field.name] = raw === '' ? null : Number(raw)
      else if (field.type === 'D') row[field.name] = raw === '' ? null : `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      else if (field.type === 'L') row[field.name] = raw === 'T' || raw === 'Y'
      else row[field.name] = raw
    }
    rows.push(row)
  }
  return rows
}

/** The old system's fee year, in the order its columns appear. */
const MONTHS = ['AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL'] as const

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim())

function properCase(value: string): string {
  return value.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).trim()
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/* -------------------------------------------------------------------------- */

function main() {
  const inDir = argValue('--in') ?? 'Old System data'
  const session = argValue('--session') ?? '2026-27'
  const plansOut = argValue('--plans-out') ?? 'old-fee-plans.csv'
  const paymentsOut = argValue('--payments-out') ?? 'old-fee-payments.csv'

  const rows = readDbf(join(process.cwd(), inDir, 'installment.DBF')).filter((row) => text(row.CURSESSION) === session)

  console.log(`\nOld fee ledger → CSV\n${'-'.repeat(52)}`)
  console.log(`  read      ${rows.length} fee records for ${session}`)

  const plans: string[] = ['admission_number,full_name,tuition,concession,annual_funds,events_funds']
  const payments: string[] = ['admission_number,full_name,paid_on,amount,month']
  const notes: string[] = []

  let planCount = 0
  let paymentCount = 0
  let chargedTotal = 0
  let receivedTotal = 0

  for (const row of rows) {
    const admissionNumber = text(row.SR_NO)
    const name = properCase(text(row.NAME))
    if (!admissionNumber) {
      notes.push(`${name || '(no name)'}: no serial number, skipped`)
      continue
    }

    const tuition = num(row.FEE)
    const concession = num(row.CONC)
    const annualFunds = num(row.ANN_FUND)
    const eventsFunds = num(row.EVT_FUND)

    // The old system's own arithmetic, checked rather than assumed: a record
    // that disagrees with itself is reported instead of imported.
    if (tuition - concession !== num(row.ACTUAL_FEE)) {
      notes.push(`${name} (${admissionNumber}): fee ${tuition} less concession ${concession} does not equal ${num(row.ACTUAL_FEE)}, skipped`)
      continue
    }
    if (concession > tuition) {
      notes.push(`${name} (${admissionNumber}): concession is larger than the fee, skipped`)
      continue
    }

    if (tuition > 0 || annualFunds > 0 || eventsFunds > 0) {
      plans.push([admissionNumber, name, String(tuition), String(concession), String(annualFunds), String(eventsFunds)].map(csvCell).join(','))
      planCount += 1
      chargedTotal += tuition - concession + annualFunds + eventsFunds
    }

    for (const month of MONTHS) {
      const amount = num(row[`${month}_RCVD`])
      if (amount <= 0) continue
      const paidOn = text(row[`${month}_DATE`])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
        notes.push(`${name} (${admissionNumber}): ${month} payment of ${amount} has no date, left out`)
        continue
      }
      payments.push([admissionNumber, name, paidOn, String(amount), month].map(csvCell).join(','))
      paymentCount += 1
      receivedTotal += amount
    }
  }

  writeFileSync(plansOut, plans.join('\n') + '\n', 'utf8')
  writeFileSync(paymentsOut, payments.join('\n') + '\n', 'utf8')

  const rupees = (n: number) => `Rs ${n.toLocaleString('en-PK')}`
  console.log(`  written   ${planCount} fee plans to ${plansOut} (${rupees(chargedTotal)} charged)`)
  console.log(`  written   ${paymentCount} payments to ${paymentsOut} (${rupees(receivedTotal)} received)`)

  if (notes.length > 0) {
    console.log(`\n  ${notes.length} record(s) need a person to look at them:`)
    for (const note of notes) console.log(`    ${note}`)
  }

  console.log('\n  Nothing has been created. Feed the files to the importer next:')
  console.log('    npx tsx scripts/import-fees.ts --plans old-fee-plans.csv --payments old-fee-payments.csv --url <address>')
  console.log('  and read its report before adding --apply.\n')
}

main()

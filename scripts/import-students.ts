/**
 * Imports students from a CSV file through the running application.
 *
 *   npm run import:students -- --file students.csv --url https://college.example.com
 *   npm run import:students -- --file students.csv --url http://localhost:3000 --apply
 *
 * Without `--apply` every row is validated and matched against the college's
 * structure and nothing is created — read the report, fix the sheet, run
 * again. With `--apply` each row is sent to POST /api/v1/students exactly as
 * the admission form would send it, so every rule the form obeys (codes,
 * duplicates, admission numbers, audit entries) applies here too, and the
 * import appears in the audit log under the administrator who ran it.
 *
 * Columns (header row, any order; names are case-insensitive):
 *   full_name, father_name, class, division, program, section
 *   optional: roll_number, admission_number, admission_date (YYYY-MM-DD; default today),
 *   gender (MALE/FEMALE/OTHER), date_of_birth, phone, email, address, city,
 *   cnic_bform, father_cnic, father_phone, father_occupation, mother_name,
 *   guardian_name, guardian_relation, guardian_phone, previous_institution,
 *   previous_result, previous_obtained, previous_total, matric_roll, matric_board, notes
 *
 * The password is asked for on the terminal and never written anywhere.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { studentCreateSchema } from '../src/validation/students'
import { normaliseHeader, parseCsv } from '../src/lib/csv-read'

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

const COLUMN_TO_FIELD: Record<string, string> = {
  full_name: 'fullName',
  father_name: 'fatherName',
  roll_number: 'rollNumber',
  admission_number: 'admissionNumber',
  admission_date: 'admissionDate',
  gender: 'gender',
  date_of_birth: 'dateOfBirth',
  phone: 'phone',
  email: 'email',
  address: 'address',
  city: 'city',
  cnic_bform: 'cnicBformNumber',
  father_cnic: 'fatherCnic',
  father_phone: 'fatherPhone',
  father_occupation: 'fatherOccupation',
  mother_name: 'motherName',
  guardian_name: 'guardianName',
  guardian_relation: 'guardianRelation',
  guardian_phone: 'guardianPhone',
  previous_institution: 'previousInstitution',
  previous_result: 'previousResultSummary',
  previous_obtained: 'previousResultObtained',
  previous_total: 'previousResultTotal',
  matric_roll: 'matricRollNumber',
  matric_board: 'matricBoard',
  notes: 'notes',
}

interface OptionGroup {
  classId: string
  className: string
  classShortName?: string
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  sections: { id: string; name: string }[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

async function main() {
  const file = argValue('--file')
  const url = (argValue('--url') ?? 'http://localhost:3000').replace(/\/$/, '')
  const apply = process.argv.includes('--apply')
  if (!file) {
    console.error('\nGive the CSV: --file students.csv [--url https://…] [--apply]\n')
    process.exit(1)
  }

  const rows = parseCsv(readFileSync(file, 'utf8'))
  const header = (rows.shift() ?? []).map(normaliseHeader)
  for (const required of ['full_name', 'father_name', 'class', 'division', 'program', 'section']) {
    if (!header.includes(required)) {
      console.error(`\nThe header row needs a "${required}" column. Found: ${header.join(', ')}\n`)
      process.exit(1)
    }
  }

  // Asked on the terminal; the harness drill supplies them through the
  // environment instead. Neither is ever written anywhere.
  let username = process.env.KC_ADMIN_USERNAME ?? ''
  let password = process.env.KC_ADMIN_PASSWORD ?? ''
  if (!username || !password) {
    const rl = createInterface({ input: stdin, output: stdout })
    username = await rl.question('Administrator username: ')
    password = await rl.question('Password (not shown afterwards): ')
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

  const sessions = (await (await fetch(`${url}/api/v1/academics/sessions`, { headers })).json()) as { data: { items?: { id: string; name: string; isCurrent: boolean }[] } | { id: string; name: string; isCurrent: boolean }[] }
  const sessionList = Array.isArray(sessions.data) ? sessions.data : (sessions.data.items ?? [])
  const current = sessionList.find((s) => s.isCurrent)
  if (!current) {
    console.error('\nNo current academic session is set. Set one under Academics → Sessions first.\n')
    process.exit(1)
  }
  const options = (await (await fetch(`${url}/api/v1/students/enrollment-options?sessionId=${current.id}`, { headers })).json()) as { data: OptionGroup[] }

  console.log(`\nImporting into session ${current.name}${apply ? '' : ' — DRY RUN, nothing will be created'}\n`)

  let ok = 0
  let bad = 0
  const problems: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const line = i + 2
    const record: Record<string, string> = {}
    header.forEach((h, k) => {
      record[h] = (rows[i]![k] ?? '').trim()
    })

    const group = options.data.find(
      (g) =>
        (norm(g.className) === norm(record.class!) || norm(g.classShortName ?? '') === norm(record.class!)) &&
        norm(g.divisionName) === norm(record.division!) &&
        norm(g.programName) === norm(record.program!),
    )
    const section = group?.sections.find((s) => norm(s.name) === norm(record.section!) || norm(`section ${s.name}`) === norm(record.section!))
    if (!group || !section) {
      bad += 1
      problems.push(`line ${line}: no section "${record.section}" in ${record.class} / ${record.division} / ${record.program} for session ${current.name}`)
      continue
    }

    const input: Record<string, unknown> = {
      admissionDate: record.admission_date || new Date().toISOString().slice(0, 10),
      enrollment: { academicSessionId: current.id, classId: group.classId, divisionId: group.divisionId, programId: group.programId, sectionId: section.id, rollNumber: record.roll_number ?? '' },
      createAccount: false,
    }
    for (const [column, field] of Object.entries(COLUMN_TO_FIELD)) {
      if (column in record && record[column] !== '' && field !== 'rollNumber' && field !== 'admissionDate') input[field] = record[column]
    }
    if (record.gender) input.gender = record.gender.toUpperCase()

    const parsed = studentCreateSchema.safeParse(input)
    if (!parsed.success) {
      bad += 1
      problems.push(`line ${line} (${record.full_name}): ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`)
      continue
    }

    if (!apply) {
      ok += 1
      continue
    }
    const res = await fetch(`${url}/api/v1/students`, { method: 'POST', headers, body: JSON.stringify(parsed.data) })
    const body = (await res.json()) as { data?: { student?: { studentCode?: string } }; error?: { message?: string; fields?: Record<string, string[]> } }
    if (res.ok) {
      ok += 1
      console.log(`  created ${record.full_name} → ${body.data?.student?.studentCode ?? 'ok'}`)
    } else {
      bad += 1
      problems.push(`line ${line} (${record.full_name}): ${body.error?.message ?? res.status}${body.error?.fields ? ' ' + JSON.stringify(body.error.fields) : ''}`)
    }
  }

  console.log(`\n${apply ? 'Created' : 'Would create'} ${ok} student${ok === 1 ? '' : 's'}; ${bad} row${bad === 1 ? '' : 's'} with problems.`)
  if (problems.length > 0) {
    console.log('\nProblems:')
    for (const p of problems) console.log(`  - ${p}`)
  }
  console.log('')
  // Let the process end on its own: process.exit() here trips a libuv
  // assertion on Windows while fetch's sockets are still closing.
  process.exitCode = bad > 0 ? 1 : 0
}

main().catch((error) => {
  console.error('\nImport failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

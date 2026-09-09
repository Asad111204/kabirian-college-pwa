/**
 * Turns the old FoxPro system's student table into a CSV the importer takes.
 *
 *   npx tsx scripts/convert-old-students.ts
 *   npx tsx scripts/convert-old-students.ts --in "Old System data" --out old-students.csv
 *
 * It only READS the old files and WRITES one CSV. It touches no database and
 * changes nothing in this system: what it produces is then fed to
 * `npm run import:students`, which validates every row before anything is
 * created.
 *
 * The old system stored class, programme and section as free text, and not
 * consistently ("FA P2 / B0YS" has a zero in it). SECTION_MAP below is the
 * whole of that translation, written out so a person can check it rather than
 * having to trust it. A combination not in the map stops the run: a student
 * silently landing in the wrong class is worse than a failed conversion.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* -------------------------------------------------------------------------- */
/* Reading a dBase / FoxPro table                                             */
/* -------------------------------------------------------------------------- */

interface DbfField {
  name: string
  type: string
  size: number
}

type DbfRow = Record<string, string | number | boolean | null>

/**
 * Reads a .DBF into plain rows.
 *
 * Enough of the format for this one job: the header lists the fields, each
 * record is fixed width, and a record whose first byte is an asterisk was
 * deleted in the old system and is skipped.
 */
function readDbf(path: string): DbfRow[] {
  const buf = readFileSync(path)
  const recordCount = buf.readUInt32LE(4)
  const headerLength = buf.readUInt16LE(8)
  const recordLength = buf.readUInt16LE(10)

  const fields: DbfField[] = []
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
      if (field.type === 'L') row[field.name] = raw === 'T' || raw === 'Y'
      else if (field.type === 'N' || field.type === 'F') row[field.name] = raw === '' ? null : Number(raw)
      else if (field.type === 'D') row[field.name] = raw === '' ? null : `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      else row[field.name] = raw
    }
    rows.push(row)
  }

  return rows
}

/* -------------------------------------------------------------------------- */
/* The translation                                                            */
/* -------------------------------------------------------------------------- */

interface Placement {
  class: string
  division: string
  program: string
  section: string
  /** The old system recorded no gender; the section it used says it. */
  gender: 'MALE' | 'FEMALE'
}

/**
 * Every class-and-section the old system actually uses, and where it lands.
 *
 * The key is `CURCLNAME | CURCLSEC`, exactly as the old file spells it,
 * misspellings and all. Every one of these was read out of the data rather
 * than guessed, and the counts were checked against the whole file.
 */
const SECTION_MAP: Record<string, Placement> = {
  'F.Sc P-I | BIO-BOYS': { class: '1st Year', division: 'Boys', program: 'Pre-Medical', section: 'A', gender: 'MALE' },
  'F.Sc P-I | BIO-GIRLS': { class: '1st Year', division: 'Girls', program: 'Pre-Medical', section: 'A', gender: 'FEMALE' },
  'F.Sc P-I | MATH-GIRLS': { class: '1st Year', division: 'Girls', program: 'Pre-Engineering', section: 'A', gender: 'FEMALE' },
  'F.Sc P-II | BIO-BOYS': { class: '2nd Year', division: 'Boys', program: 'Pre-Medical', section: 'A', gender: 'MALE' },
  'F.Sc P-II | BIO-GIRLS': { class: '2nd Year', division: 'Girls', program: 'Pre-Medical', section: 'A', gender: 'FEMALE' },
  'F.Sc P-II | MATH-BOYS': { class: '2nd Year', division: 'Boys', program: 'Pre-Engineering', section: 'A', gender: 'MALE' },
  'FA P1 | BOYS': { class: '1st Year', division: 'Boys', program: 'FA', section: 'A', gender: 'MALE' },
  'FA P1 | GIRLS': { class: '1st Year', division: 'Girls', program: 'FA', section: 'A', gender: 'FEMALE' },
  // "B0YS" is spelt with a zero in the old file. Left as it is found.
  'FA P2 | B0YS': { class: '2nd Year', division: 'Boys', program: 'FA', section: 'A', gender: 'MALE' },
  'FA P2 | GIRLS': { class: '2nd Year', division: 'Girls', program: 'FA', section: 'A', gender: 'FEMALE' },
  'ICS (ECO) | GIRLS P-1': { class: '1st Year', division: 'Girls', program: 'ICS Economics', section: 'A', gender: 'FEMALE' },
  'ICS ECO P-2 | BOYS': { class: '2nd Year', division: 'Boys', program: 'ICS Economics', section: 'A', gender: 'MALE' },
  'ICS ECO P-2 | GIRLS': { class: '2nd Year', division: 'Girls', program: 'ICS Economics', section: 'A', gender: 'FEMALE' },
  'ICS P-I | BOYS': { class: '1st Year', division: 'Boys', program: 'ICS Physics', section: 'A', gender: 'MALE' },
  'ICS P-I | GIRLS': { class: '1st Year', division: 'Girls', program: 'ICS Physics', section: 'A', gender: 'FEMALE' },
  'ICS P-II | BOYS': { class: '2nd Year', division: 'Boys', program: 'ICS Physics', section: 'A', gender: 'MALE' },
  'ICS P-II | GIRLS': { class: '2nd Year', division: 'Girls', program: 'ICS Physics', section: 'A', gender: 'FEMALE' },
}

/* -------------------------------------------------------------------------- */
/* Tidying what the old system stored                                         */
/* -------------------------------------------------------------------------- */

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim())

/** Names are stored shouting; they are written as the college would write them. */
function properCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
    // Keep initials and short particles as they read: "M Amin", not "M amin".
    .replace(/\bMuhammad\b/g, 'Muhammad')
    .trim()
}

/** 13 digits become 12345-1234567-1; anything else is dropped rather than guessed. */
function formatCnic(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 13) return ''
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
}

/** 11 digits become 0300-1234567; anything else is dropped. */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  if (digits.length === 12 && digits.startsWith('92')) return `0${digits.slice(2, 5)}-${digits.slice(5)}`
  return ''
}

/** A date the new system will accept, or nothing. */
function cleanDate(value: unknown): string {
  const raw = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const [year] = raw.split('-').map(Number)
  // The old file holds a few impossible dates; they are left out rather than
  // imported as fact.
  if (!year || year < 1950 || year > new Date().getFullYear()) return ''
  return raw
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

interface PriorExam {
  exam: string
  year: string
  roll: string
  board: string
  institution: string
  obtained: number | null
  total: number | null
}

/** How the old system spelt a matriculation result. */
const MATRIC_LABELS = new Set(['10TH', 'MATRIC', 'SSC'])

/**
 * The exam a student sat before joining.
 *
 * The old file has three numbered slots for it, and which one holds the
 * matriculation result depends on whoever typed the record: 71 students have
 * it in the first, another 47 have it only in the second. Reading the first
 * slot alone — as this converter first did — quietly lost a quarter of the
 * college's board results, so all three are read and the one that looks like
 * matric wins. Failing that, the first slot with anything in it.
 */
function priorExam(row: DbfRow): PriorExam {
  const slots: PriorExam[] = [1, 2, 3].map((n) => {
    const obtained = row[`MARK_OBT_${n}`]
    const total = row[`MARK_TOT_${n}`]
    const roll = text(row[`EXAM_ROL_${n}`])
    return {
      exam: text(row[`EXAM_${n}`]),
      year: text(row[`YEAR_${n}`]),
      // A roll number of zero is the old system's way of saying it has none.
      roll: roll === '0' ? '' : roll,
      board: text(row[`BORD_NAM_${n}`]),
      institution: text(row[`INSTI_${n}`]),
      obtained: typeof obtained === 'number' ? obtained : null,
      total: typeof total === 'number' ? total : null,
    }
  })

  const filled = (slot: PriorExam) => Boolean(slot.exam || slot.roll || (slot.total ?? 0) > 0)
  return slots.find((slot) => filled(slot) && MATRIC_LABELS.has(slot.exam.toUpperCase())) ?? slots.find(filled) ?? slots[0]!
}

/* -------------------------------------------------------------------------- */

const COLUMNS = [
  'full_name', 'father_name', 'class', 'division', 'program', 'section',
  'admission_number', 'admission_date', 'gender', 'date_of_birth',
  'phone', 'address', 'cnic_bform', 'father_cnic', 'father_phone',
  'previous_institution', 'previous_result', 'previous_obtained', 'previous_total',
  'matric_roll', 'matric_board', 'notes',
] as const

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function main() {
  const inDir = argValue('--in') ?? 'Old System data'
  const outFile = argValue('--out') ?? 'old-students.csv'

  const rows = readDbf(join(process.cwd(), inDir, 'student.DBF'))
  console.log(`\nOld system → CSV\n${'-'.repeat(52)}`)
  console.log(`  read      ${rows.length} students from ${inDir}/student.DBF`)

  const unmapped = new Map<string, number>()
  const lines: string[] = [COLUMNS.join(',')]
  const counts = { written: 0, noName: 0, noPlacement: 0 }
  const dropped: string[] = []

  for (const row of rows) {
    const name = properCase(text(row.NAME))
    if (!name) {
      counts.noName += 1
      continue
    }

    const key = `${text(row.CURCLNAME)} | ${text(row.CURCLSEC)}`
    const placement = SECTION_MAP[key]
    if (!placement) {
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1)
      counts.noPlacement += 1
      continue
    }

    // Previous board result: only when both halves are there and agree.
    const prior = priorExam(row)
    const obtained = prior.obtained
    const total = prior.total
    const resultUsable = obtained !== null && total !== null && total > 0 && obtained <= total

    const exam = prior.exam
    const year = prior.year

    // Anything the new system has no field for, kept as a note rather than lost.
    const notes = [
      text(row.REFERENCE) ? `Reference: ${text(row.REFERENCE)}` : '',
      text(row.REASON) ? `Old system note: ${text(row.REASON)}` : '',
      `Imported from the previous college system (serial ${text(row.SR_NO)}).`,
    ]
      .filter(Boolean)
      .join(' ')

    const record: Record<(typeof COLUMNS)[number], string> = {
      full_name: name,
      father_name: properCase(text(row.F_NAME)),
      class: placement.class,
      division: placement.division,
      program: placement.program,
      section: placement.section,
      admission_number: text(row.SR_NO),
      admission_date: cleanDate(row.ADM_DATE),
      gender: placement.gender,
      date_of_birth: cleanDate(row.BIRTH_D),
      phone: formatPhone(text(row.MOBILE)),
      address: properCase(text(row.ADDRESS)),
      cnic_bform: formatCnic(text(row.BAY_FORM)),
      father_cnic: formatCnic(text(row.NIC_F)),
      father_phone: formatPhone(text(row.TELEPHONE)),
      previous_institution: prior.institution,
      previous_result: exam ? `${exam}${year ? ` (${year})` : ''}` : '',
      previous_obtained: resultUsable ? String(obtained) : '',
      previous_total: resultUsable ? String(total) : '',
      matric_roll: prior.roll,
      matric_board: prior.board,
      notes,
    }

    lines.push(COLUMNS.map((column) => csvCell(record[column])).join(','))
    counts.written += 1
    if (!record.admission_date) dropped.push(`${name}: no admission date`)
  }

  writeFileSync(join(process.cwd(), outFile), `${lines.join('\n')}\n`, 'utf8')

  console.log(`  written   ${counts.written} rows to ${outFile}`)
  if (counts.noName > 0) console.log(`  skipped   ${counts.noName} with no name`)
  if (counts.noPlacement > 0) {
    console.log(`  SKIPPED   ${counts.noPlacement} whose class is not in the map:`)
    for (const [key, n] of unmapped) console.log(`              ${key}  (${n})`)
  }
  if (dropped.length > 0) {
    console.log(`\n  ${dropped.length} row(s) need an admission date before importing:`)
    for (const line of dropped.slice(0, 10)) console.log(`    ${line}`)
  }

  console.log('\n  Nothing has been created. Feed the CSV to the importer next:')
  console.log(`    npm run import:students -- --file ${outFile} --url <address>`)
  console.log('  and read its report before adding --apply.\n')

  if (counts.noPlacement > 0) process.exitCode = 1
}

main()

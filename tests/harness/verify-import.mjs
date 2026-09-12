/**
 * The import drill: a small CSV with one bad row goes through
 * scripts/import-students.ts — first as a dry run that must create nothing,
 * then for real — against the running production build.
 * Run by tests/harness/run.mjs --import-drill.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const isWindows = process.platform === 'win32'

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
const quote = (a) => (isWindows && /\s/.test(a) ? `"${a}"` : a)

async function admin(path) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ username: 'harness.admin', password: ids.password }) })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  const r = await fetch(`${BASE}${path}`, { headers: { cookie } })
  return (await r.json()).data
}

const dir = mkdtempSync(join(tmpdir(), 'nova-school-import-'))
const csv = join(dir, 'intake.csv')
writeFileSync(
  csv,
  [
    'Full Name,Father Name,Class,Division,Program,Section,Roll Number,Gender,CNIC BForm,Phone',
    '"Khan, Bilal",Aslam Khan,1st Year,Boys,Pre-Medical,A,21,MALE,12345-1234567-1,0300-1234567',
    'Hamza Butt,Tariq Butt,1st Year,Boys,Pre-Medical,Section B,7,male,,',
    'Nobody Here,Somebody,1st Year,Boys,Pre-Medical,Z,1,MALE,,',
    'Bad Cnic,Father,1st Year,Boys,Pre-Medical,A,22,MALE,not-a-cnic,',
  ].join('\r\n'),
)
const run = (...extra) =>
  spawnSync('npx', ['tsx', 'scripts/import-students.ts', '--file', csv, '--url', BASE, ...extra].map(quote), {
    cwd: ROOT,
    shell: isWindows,
    encoding: 'utf8',
    env: { ...process.env, KC_ADMIN_USERNAME: 'harness.admin', KC_ADMIN_PASSWORD: ids.password },
  })

console.log('\nThe import drill\n' + '-'.repeat(52))
const before = (await admin('/api/v1/students?pageSize=5')).total

let r = run()
check('the dry run reports two good rows and two problems, and exits non-zero because of them', r.status === 1 && /Would create 2 students; 2 rows with problems/.test(r.stdout), (r.stdout + r.stderr).slice(-400))
check('it names the section that does not exist and the CNIC that is not one', /no section "Z"/.test(r.stdout) && /cnicBformNumber/.test(r.stdout))
check('the dry run created nothing', (await admin('/api/v1/students?pageSize=5')).total === before)
check('the password is not echoed anywhere', !r.stdout.includes(ids.password) && !r.stderr.includes(ids.password))

r = run('--apply')
check('--apply creates the two good rows and still refuses the two bad ones', r.status === 1 && /Created 2 students; 2 rows with problems/.test(r.stdout), (r.stdout + r.stderr).slice(-400))
const after = await admin('/api/v1/students?pageSize=100&search=Bilal')
const bilal = after.items.find((s) => s.fullName === 'Khan, Bilal')
check('a quoted name with a comma arrived intact, with a system-generated student code', Boolean(bilal) && /^[A-Z]+-\d+$/.test(bilal?.studentCode ?? ''), JSON.stringify(after.items.map((s) => [s.fullName, s.studentCode])))
const total = (await admin('/api/v1/students?pageSize=5')).total
check('exactly two students were added', total === before + 2, `${before} → ${total}`)
const audit = await admin('/api/v1/audit?action=student.created&pageSize=5')
check('each creation is in the audit log under the administrator who ran the import', audit.items.length >= 2 && audit.items.slice(0, 2).every((i) => i.actor?.username === 'harness.admin'))

rmSync(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

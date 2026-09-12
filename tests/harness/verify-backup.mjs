/**
 * The restore drill: back the throwaway database up, change it, put the
 * backup back, and prove the app still works on the restored data.
 * Run by tests/harness/run.mjs --backup-drill.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(ROOT, 'package.json'))
const pg = require('pg')
const BASE = 'http://localhost:3002'
const DB_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable'
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
const tsx = (script, ...args) => spawnSync('npx', ['tsx', script, ...args].map(quote), { cwd: ROOT, shell: isWindows, encoding: 'utf8', env: { ...process.env, DATABASE_URL: DB_URL } })

const client = new pg.Client({ connectionString: DB_URL })
await client.connect()
const count = async (table) => Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n)
const login = async (username) => {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ username, password: ids.password }), redirect: 'manual' })
  return res.status
}

const dir = mkdtempSync(join(tmpdir(), 'nova-school-backup-'))
const before = { students: await count('students'), users: await count('users'), audit: await count('audit_logs'), notices: await count('notices') }

console.log('\nThe restore drill\n' + '-'.repeat(52))
let r = tsx('scripts/backup-export.ts', '--out', dir)
check('the export runs and writes a manifest', r.status === 0 && /Manifest written/.test(r.stdout), r.stderr.slice(0, 200))
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
// The harness applies migrations by hand, so there is no _prisma_migrations table here; production has one.
check('the manifest counts every table', manifest.tables.students === before.students && manifest.tables.users === before.users && manifest.tables.audit_logs === before.audit && Object.keys(manifest.tables).length >= 35, JSON.stringify(manifest.tables).slice(0, 200))
check('the export never prints a connection password', !/postgres:postgres@/.test(r.stdout))

// Damage: delete every notice, add a student, change a name.
await client.query(`DELETE FROM notice_targets`)
await client.query(`DELETE FROM notices`)
await client.query(`UPDATE students SET full_name = 'Renamed After Backup' WHERE id = $1`, [ids.student])
check('the database has been changed since the backup', (await count('notices')) === 0)

r = tsx('scripts/backup-restore.ts', '--from', dir)
check('a restore without --yes changes nothing', r.status === 0 && /Dry run/.test(r.stdout) && (await count('notices')) === 0, r.stderr.slice(0, 200))

r = tsx('scripts/backup-restore.ts', '--from', dir, '--yes')
check('the restore runs in one transaction and reports the rows', r.status === 0 && /Restored \d+ tables/.test(r.stdout), (r.stderr || r.stdout).slice(-300))
const after = { students: await count('students'), users: await count('users'), audit: await count('audit_logs'), notices: await count('notices') }
check('every table is back to the backup’s counts', JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} vs ${JSON.stringify(after)}`)
const name = (await client.query(`SELECT full_name FROM students WHERE id = $1`, [ids.student])).rows[0]?.full_name
check('a changed record is back to its backed-up value', name === 'Ali Raza', name)

check('the app still signs people in on the restored data', (await login('harness.admin')) === 200)
const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ username: 'harness.teacher.a', password: ids.password }) })
const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
const feed = await fetch(`${BASE}/api/v1/notices/feed`, { headers: { cookie } })
check('…and serves the restored notices', feed.status === 200 && ((await feed.json()).data?.total ?? 0) > 0)

await client.end()
rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}

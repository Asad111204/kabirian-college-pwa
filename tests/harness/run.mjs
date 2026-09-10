/**
 * The production harness: the PRODUCTION build against a THROWAWAY database.
 *
 *   npm run build
 *   node tests/harness/run.mjs                 API + page checks (Phases 10-15)
 *   node tests/harness/run.mjs --playwright    …and the browser tests in tests/e2e
 *   node tests/harness/run.mjs --load          …and 5,000 students with timings
 *   node tests/harness/run.mjs --import-drill  …and the student CSV import, dry run then for real
 *   node tests/harness/run.mjs --backup-drill  …and a backup, damage, restore, verify cycle
 *   node tests/harness/run.mjs --keep          leave the server up for a manual look
 *
 * What it does, in order: starts an in-memory PostgreSQL (PGlite) on a local
 * socket; moves the project's `.env` aside and writes one that points at it;
 * applies every migration; runs the reference seed and the fixture seeds;
 * starts `next start` on port 3002; runs the verifiers; restores `.env`.
 * Whatever happens, `.env` is put back — nothing here can reach Neon.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PORT = 3002
const DB_PORT = 55432
const DB_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`
const BASE = `http://localhost:${PORT}`
const args = new Set(process.argv.slice(2))
const isWindows = process.platform === 'win32'

const log = (s) => console.log(`\n== ${s} ==`)

for (const f of ['.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(join(ROOT, f))) {
    console.error(`refusing: ${f} exists and would override the harness env`)
    process.exit(2)
  }
}
if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.error('no production build found: run `npm run build` first')
  process.exit(2)
}

const children = []
/**
 * On Windows `npx` is a .cmd file, which Node will only run through a shell —
 * and a shell splits an unquoted path on its spaces ("D:\Important Files").
 */
const quote = (a) => (isWindows && /\s/.test(a) ? `"${a}"` : a)
function start(cmd, cmdArgs, options = {}) {
  const child = spawn(cmd, cmdArgs.map(quote), { stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, ...options })
  children.push(child)
  return child
}
function kill(child) {
  if (!child || child.exitCode !== null) return
  if (isWindows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}
function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs.map(quote), { stdio: 'inherit', shell: isWindows, cwd: ROOT, ...options })
  return result.status ?? 1
}
const portOpen = (port) =>
  new Promise((resolve) => {
    const s = createConnection(port, '127.0.0.1', () => {
      s.end()
      resolve(true)
    })
    s.on('error', () => resolve(false))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const envPath = join(ROOT, '.env')
const envBackup = join(ROOT, '.env.harness-bak')
let envSwapped = false

function cleanup() {
  for (const child of children) kill(child)
  if (envSwapped && existsSync(envBackup)) {
    renameSync(envBackup, envPath)
    envSwapped = false
  }
  console.log(`\ncleanup done; .env restored: ${existsSync(envPath) ? 'yes' : 'NO .env (there was none before)'}`)
}
process.on('exit', cleanup)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))

let failures = 0
try {
  log('throwaway PostgreSQL')
  rmSync(join(HERE, 'pgdata'), { recursive: true, force: true })
  const db = start('node', [join(HERE, 'server.mjs')], { env: { ...process.env, TZ: 'UTC' } })
  const dbLog = []
  db.stderr.on('data', (d) => dbLog.push(String(d)))
  for (let i = 0; i < 60 && !(await portOpen(DB_PORT)); i++) await sleep(500)
  if (!(await portOpen(DB_PORT))) throw new Error(`pglite did not start\n${dbLog.join('')}`)
  console.log('  listening')

  log('swap .env for the harness')
  if (existsSync(envBackup)) {
    // A previous run was killed before it could clean up (a hard stop on
    // Windows skips the exit handler): the backup is the real file.
    renameSync(envBackup, envPath)
    console.log('  restored .env left behind by an earlier run')
  }
  if (existsSync(envPath)) renameSync(envPath, envBackup)
  envSwapped = true
  writeFileSync(
    envPath,
    [
      `APP_URL="${BASE}"`,
      'APP_TIMEZONE="Asia/Karachi"',
      'APP_COLLEGE_NAME="Kabirian College"',
      'LOG_LEVEL="warn"',
      `DATABASE_URL="${DB_URL}"`,
      'DATABASE_POOL_MAX="5"',
      'STORAGE_PROVIDER=memory',
      '',
    ].join('\n'),
  )
  const harnessEnv = { ...process.env, DATABASE_URL: DB_URL, APP_URL: BASE, APP_TIMEZONE: 'Asia/Karachi', STORAGE_PROVIDER: 'memory', LOG_LEVEL: 'warn' }
  delete harnessEnv.DATABASE_DIRECT_URL

  log('migrations')
  if (run('node', [join(HERE, 'seed.mjs'), '--migrate'], { env: harnessEnv }) !== 0) throw new Error('migrations failed')
  log('reference seed')
  if (run('npx', ['tsx', 'prisma/seed/reference.ts'], { env: harnessEnv }) !== 0) throw new Error('reference seed failed')
  log('fixture seeds')
  if (run('node', [join(HERE, 'seed.mjs'), '--data'], { env: harnessEnv }) !== 0) throw new Error('data seed failed')
  if (run('node', [join(HERE, 'seed-notices.mjs')], { env: harnessEnv }) !== 0) throw new Error('notices seed failed')
  if (run('node', [join(HERE, 'seed-exams.mjs')], { env: harnessEnv }) !== 0) throw new Error('exam seed failed')
  log('production server')
  const next = start('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, env: harnessEnv })
  const nextLog = []
  next.stdout.on('data', (d) => nextLog.push(String(d)))
  next.stderr.on('data', (d) => nextLog.push(String(d)))
  let code = 0
  for (let i = 0; i < 90; i++) {
    try {
      code = (await fetch(`${BASE}/login`)).status
      if (code === 200) break
    } catch {
      /* not up yet */
    }
    await sleep(1000)
  }
  console.log(`  /login -> ${code}`)
  if (code !== 200) throw new Error(`next did not start\n${nextLog.slice(-30).join('')}`)

  log('verify')
  for (const v of ['verify.mjs', 'verify-notices.mjs', 'verify-security.mjs', 'verify-pwa.mjs', 'verify-attendance.mjs', 'verify-photos.mjs', 'verify-homework.mjs', 'verify-marks-deadline.mjs', 'verify-staff-attendance.mjs', 'verify-complaints.mjs', 'verify-portals.mjs', 'verify-fees.mjs', 'verify-finance.mjs', 'verify-notifications.mjs', 'verify-assignments.mjs', 'verify-self-documents.mjs', 'verify-periods.mjs']) {
    console.log(`\n--- ${v}`)
    if (run('node', [join(HERE, v)], { env: harnessEnv }) !== 0) failures += 1
  }

  if (args.has('--playwright')) {
    log('browser tests (Playwright)')
    if (run('npx', ['playwright', 'test'], { env: { ...harnessEnv, E2E_BASE_URL: BASE } }) !== 0) failures += 1
  }

  // The load fixtures go in last: every check above expects exactly the fixtures.
  if (args.has('--load')) {
    log('load seed: 5,000 students')
    if (run('node', [join(HERE, 'seed-load.mjs')], { env: harnessEnv }) !== 0) throw new Error('load seed failed')
    console.log('\n--- verify-load.mjs')
    if (run('node', [join(HERE, 'verify-load.mjs')], { env: harnessEnv }) !== 0) failures += 1
  }

  // The import drill: a CSV through scripts/import-students.ts, dry run then for real.
  if (args.has('--import-drill')) {
    log('student import drill')
    if (run('node', [join(HERE, 'verify-import.mjs')], { env: harnessEnv }) !== 0) failures += 1
  }

  // The restore drill: export, damage, restore, and prove the app still works.
  if (args.has('--backup-drill')) {
    log('backup and restore drill')
    if (run('node', [join(HERE, 'verify-backup.mjs')], { env: harnessEnv }) !== 0) failures += 1
  }

  const errors = nextLog.join('').split('\n').filter((l) => /"level":"error"/.test(l))
  // Anything the framework itself threw: a server component that fails
  // does not go through the app's logger, so it would otherwise be
  // invisible here and a 500 would have no explanation.
  const thrown = nextLog.join('').split('\n').filter((l) => /Error:|at async |TypeError/.test(l))
  if (thrown.length > 0) {
    console.log('\nunhandled server errors:')
    for (const line of thrown.slice(0, 25)) console.log(`  ${line}`)
  }

  console.log(`\nserver log errors: ${errors.length}${errors.length ? ' (storage errors are unexpected with the in-memory provider)' : ''}`)

  if (args.has('--keep')) {
    console.log(`\nServer left running at ${BASE} (harness.admin / ${JSON.parse(readFileSync(join(HERE, 'ids.json'), 'utf8')).password}). Press Ctrl+C to stop and restore .env.`)
    await new Promise(() => {})
  }
} catch (error) {
  console.error(`\n${error.message}`)
  failures += 1
}

// Say it out loud. A verifier that crashes on load prints its stack and
// then nothing else; without this line the run ends looking calm and only
// the exit code disagrees, which is how a whole file once went missing from
// a run unnoticed.
if (failures > 0) {
  console.log(`\n${failures} step${failures === 1 ? '' : 's'} FAILED. Scroll up: a step that crashed on load prints a stack instead of checks.`)
} else {
  console.log('\nAll steps passed.')
}

process.exitCode = failures > 0 ? 1 : 0
process.exit()

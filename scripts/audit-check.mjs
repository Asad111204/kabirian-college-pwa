/**
 * Dependency audit with an explicit, reviewed allowlist.
 *
 * `npm audit` cannot ignore an advisory, and it cannot tell that the MySQL
 * driver inside the Prisma CLI is never loaded by an app that talks to
 * PostgreSQL. So this script runs the audit, subtracts the advisories listed
 * in `.audit-allowlist.json` — each with a reason and a review date — and
 * fails on anything else at "high" or above. An allowlist entry that no
 * longer matches anything is reported so it can be removed.
 *
 *   npm run audit
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const LEVELS = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const FAIL_AT = LEVELS.high

const allowlist = JSON.parse(readFileSync(new URL('../.audit-allowlist.json', import.meta.url), 'utf8'))
const allowed = new Map(allowlist.advisories.map((a) => [a.id, a]))

let raw
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch (error) {
  // npm exits non-zero when it finds anything; the JSON is still on stdout.
  raw = error.stdout
}
const report = JSON.parse(raw)

const seen = new Set()
const failures = []
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue
    const id = via.url.split('/').pop()
    seen.add(id)
    if (LEVELS[via.severity] < FAIL_AT) continue
    if (allowed.has(id)) continue
    failures.push(`${id} ${via.severity.padEnd(8)} ${name}: ${via.title}`)
  }
}

for (const entry of allowlist.advisories) {
  if (!seen.has(entry.id)) console.log(`note: allowlisted ${entry.id} no longer appears — it can be removed from .audit-allowlist.json`)
}

const counts = report.metadata?.vulnerabilities ?? {}
console.log(`npm audit (production dependencies): ${counts.total ?? 0} advisories, ${allowlist.advisories.length} allowlisted`)

if (failures.length > 0) {
  console.error('\nUnreviewed advisories at high or above:')
  for (const line of failures) console.error('  ' + line)
  process.exit(1)
}
console.log('OK — nothing unreviewed at high or above.')

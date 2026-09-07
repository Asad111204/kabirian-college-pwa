/**
 * Exports every table of the database to a folder of JSON files.
 *
 *   npm run backup:export                 → backups/<timestamp>/
 *   npm run backup:export -- --out D:/kabirian-backups/today
 *
 * Why not pg_dump: it is a separate program the office's computer will not
 * have. This is a logical backup the same Node the app runs on can take and
 * `npm run backup:restore` can put back (ADR-164). Neon's own point-in-time
 * history is the first line of defence; this is the copy the college holds
 * itself, on a drive it controls.
 *
 * The export contains everything — names, phone numbers, password hashes.
 * Keep it where only the administration can reach it, and never commit it.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'
import pg from 'pg'

if (existsSync('.env')) loadEnvFile('.env')
const connectionString = process.env.DATABASE_URL ?? ''
if (!connectionString) {
  console.error('\nDATABASE_URL is not set.\n')
  process.exit(1)
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(unparseable)'
  }
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out = argValue('--out') ?? join('backups', stamp)
  mkdirSync(out, { recursive: true })

  const client = new pg.Client({ connectionString })
  await client.connect()
  console.log(`\nBacking up ${safeHost(connectionString)} → ${out}`)

  // One consistent view of every table: nothing written after this point is included.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const tables = (
    await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name)

  const manifest: { takenAt: string; tables: Record<string, number> } = { takenAt: new Date().toISOString(), tables: {} }
  for (const table of tables) {
    const { rows } = await client.query<{ data: unknown[] | null }>(`SELECT json_agg(t) AS data FROM "${table}" t`)
    const data = rows[0]?.data ?? []
    writeFileSync(join(out, `${table}.json`), JSON.stringify(data))
    manifest.tables[table] = data.length
    console.log(`  ${table.padEnd(28)} ${String(data.length).padStart(7)} rows`)
  }
  await client.query('COMMIT')
  await client.end()

  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0)
  console.log(`\n${tables.length} tables, ${total} rows. Manifest written.\n`)
}

main().catch((error) => {
  console.error('\nBackup failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

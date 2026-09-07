/**
 * Restores a backup folder written by `npm run backup:export`.
 *
 *   npm run backup:restore -- --from backups/2026-09-08T10-00-00
 *   npm run backup:restore -- --from backups/2026-09-08T10-00-00 --yes
 *
 * Without `--yes` it only reads the manifest and says what it would do.
 * With `--yes` it EMPTIES EVERY TABLE and puts the backup's rows back, in one
 * transaction — either the whole restore lands or nothing changes.
 *
 * It refuses to run against a database whose migrations do not match the
 * backup's: a backup from an older schema belongs on an older schema.
 * The restore drill in the harness (`node tests/harness/run.mjs
 * --backup-drill`) exercises exactly this path against a throwaway database.
 */
import { existsSync, readFileSync } from 'node:fs'
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
  const from = argValue('--from')
  if (!from || !existsSync(join(from, 'manifest.json'))) {
    console.error('\nGive the backup folder: --from backups/<timestamp> (it must contain manifest.json).\n')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')) as { takenAt: string; tables: Record<string, number> }
  const apply = process.argv.includes('--yes')

  const client = new pg.Client({ connectionString })
  await client.connect()
  console.log(`\nBackup taken ${manifest.takenAt} → ${safeHost(connectionString)}${apply ? '' : ' (dry run: add --yes to restore)'}`)

  const dbTables = new Set((await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name))

  // The schema must match: compare applied migrations with the backup's.
  // (A database migrated by hand — the test harness — has no migrations
  // table; then both sides must lack it.)
  const backupHasMigrations = '_prisma_migrations' in manifest.tables
  const dbHasMigrations = dbTables.has('_prisma_migrations')
  if (backupHasMigrations !== dbHasMigrations) {
    console.error('\nRefusing: one side has a migrations table and the other does not — these are not the same kind of database.\n')
    await client.end()
    process.exit(1)
  }
  if (backupHasMigrations) {
    const backupMigrations = (JSON.parse(readFileSync(join(from, '_prisma_migrations.json'), 'utf8')) as { migration_name: string }[])
      .map((m) => m.migration_name)
      .sort()
    const dbMigrations = (await client.query<{ migration_name: string }>('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name')).rows.map((r) => r.migration_name)
    if (JSON.stringify(backupMigrations) !== JSON.stringify(dbMigrations)) {
      console.error('\nRefusing: the database has a different set of migrations from the backup.')
      console.error(`  backup: ${backupMigrations.length} migrations, latest ${backupMigrations.at(-1)}`)
      console.error(`  database: ${dbMigrations.length} migrations, latest ${dbMigrations.at(-1)}`)
      console.error('Run `npm run db:migrate` to the same point first.\n')
      await client.end()
      process.exit(1)
    }
  }

  const tables = Object.keys(manifest.tables).filter((t) => t !== '_prisma_migrations')
  const missing = tables.filter((t) => !dbTables.has(t))
  if (missing.length > 0) {
    console.error(`\nRefusing: the database has no table ${missing.join(', ')}.\n`)
    await client.end()
    process.exit(1)
  }

  for (const table of tables) console.log(`  ${table.padEnd(28)} ${String(manifest.tables[table]).padStart(7)} rows`)
  if (!apply) {
    console.log('\nDry run only. Nothing was changed.\n')
    await client.end()
    return
  }

  await client.query('BEGIN')
  try {
    // Foreign keys are checked at the end of the transaction, so tables can go
    // back in any order; DEFERRABLE is set on the constraints by Prisma's
    // migrations only where declared, so triggers are paused instead.
    for (const table of tables) await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`)
    await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')}`)
    for (const table of tables) {
      const rows = JSON.parse(readFileSync(join(from, `${table}.json`), 'utf8')) as unknown[]
      if (rows.length === 0) continue
      await client.query(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, [JSON.stringify(rows)])
    }
    for (const table of tables) await client.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }

  let total = 0
  for (const table of tables) {
    const n = Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n)
    total += n
    if (n !== manifest.tables[table]) console.warn(`  ${table}: ${n} rows after restore, ${manifest.tables[table]} in the backup`)
  }
  await client.end()
  console.log(`\nRestored ${tables.length} tables, ${total} rows. Signed-in sessions from the backup are back too; anyone signed in since will need to sign in again.\n`)
}

main().catch((error) => {
  console.error('\nRestore failed and was rolled back:', error instanceof Error ? error.message : error)
  process.exit(1)
})

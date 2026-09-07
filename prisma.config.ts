/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Prisma 7 no longer reads `url = env("DATABASE_URL")` from schema.prisma, and it
 * no longer loads .env automatically — so we do both here. This file is used by
 * the CLI only (`prisma migrate`, `prisma studio`, …). The application itself
 * connects through the driver adapter in src/server/db/prisma.ts.
 *
 * Migrations run on DATABASE_DIRECT_URL when it is set. A connection pooler
 * (Neon's -pooler host, PgBouncer) will close the connection partway through a
 * long DDL script and leave the migration half-applied — tables created, foreign
 * keys and CHECK constraints missing — which is far worse than a clean failure.
 */
import { defineConfig, env } from 'prisma/config'
import { loadEnvFile } from 'node:process'
import { existsSync } from 'node:fs'

// Node 20.11+/24 built-in .env loader — no dotenv dependency needed.
if (existsSync('.env')) {
  loadEnvFile('.env')
}

/**
 * Which variable holds the URL the CLI should connect through, or `null` when
 * neither is set.
 *
 * `prisma generate` needs no database at all -- it only reads the schema and
 * writes TypeScript -- so a build machine that has no database credentials must
 * still be able to run it. Declaring `datasource` unconditionally made
 * `defineConfig` resolve the variable while the config file was being loaded,
 * which failed the whole build on a host where it is absent
 * (`PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`).
 *
 * The commands that genuinely need a connection -- `migrate`, `studio`, `db
 * execute` -- still fail loudly, because without a datasource they have nothing
 * to connect to.
 */
const migrationUrlVariable = process.env.DATABASE_DIRECT_URL?.trim()
  ? 'DATABASE_DIRECT_URL'
  : process.env.DATABASE_URL?.trim()
    ? 'DATABASE_URL'
    : null

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(migrationUrlVariable ? { datasource: { url: env(migrationUrlVariable) } } : {}),
})

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

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_DIRECT_URL?.trim()
      ? env('DATABASE_DIRECT_URL')
      : env('DATABASE_URL'),
  },
})

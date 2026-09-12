/**
 * Shared helpers for the seed scripts.
 *
 * The seeds run as plain Node scripts (via tsx), outside Next.js, so they build
 * their own Prisma client and load .env themselves.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('\nDATABASE_URL is not set. Copy .env.example to .env and fill it in.\n')
  process.exit(1)
}

/**
 * One connection is plenty for a seed script, and it is kind to hosted
 * databases that only allow a handful.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
})

export function heading(text: string) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`)
}

export function done(what: string, created: number, existing: number) {
  const parts = [`${created} created`]
  if (existing > 0) parts.push(`${existing} already existed`)
  console.log(`  ${what.padEnd(22)} ${parts.join(', ')}`)
}

/** Stops a script that would damage real data. */
export function assertNotProduction(scriptName: string) {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      `\nRefusing to run "${scriptName}" with NODE_ENV=production.\n` +
        `This script creates demonstration data and must never touch a live college database.\n`,
    )
    process.exit(1)
  }
}

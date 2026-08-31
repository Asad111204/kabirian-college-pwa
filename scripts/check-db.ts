/**
 * Checks that the app can reach the database and reports what is in it.
 *
 *   npm run check:db
 *
 * Useful as the very first troubleshooting step: it separates "my connection
 * string is wrong" from "my application code is wrong".
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) loadEnvFile('.env')

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('\n  DATABASE_URL is not set.\n  Copy .env.example to .env and fill it in.\n')
  process.exit(1)
}

/** Never print the password. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.username ? '***@' : ''}${parsed.host}${parsed.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })

async function main() {
  console.log(`\n  Connecting to: ${safeUrl(connectionString!)}`)

  const started = Date.now()
  await prisma.$queryRaw`SELECT 1`
  console.log(`  Connected in ${Date.now() - started} ms\n`)

  const [sessions, classes, divisions, programs, subjects, groups, sections, users, students, staff] =
    await Promise.all([
      prisma.academicSession.count(),
      prisma.class.count(),
      prisma.division.count(),
      prisma.program.count(),
      prisma.subject.count(),
      prisma.academicGroup.count(),
      prisma.section.count(),
      prisma.user.count(),
      prisma.student.count(),
      prisma.staff.count(),
    ])

  const rows: [string, number][] = [
    ['Academic sessions', sessions],
    ['Classes', classes],
    ['Divisions', divisions],
    ['Programs', programs],
    ['Subjects', subjects],
    ['Academic groups', groups],
    ['Sections', sections],
    ['User accounts', users],
    ['Students', students],
    ['Staff', staff],
  ]

  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(20)} ${count}`)
  }

  const current = await prisma.academicSession.findFirst({ where: { isCurrent: true } })
  console.log(`\n  Current session:     ${current?.name ?? '(none set)'}`)

  if (users === 0) {
    console.log('\n  No user accounts yet — run: npm run create-admin')
  }
  console.log()
}

main()
  .catch((error) => {
    console.error('\n  Could not reach the database.\n')
    console.error(`  ${error instanceof Error ? error.message : String(error)}\n`)
    console.error('  Common causes:')
    console.error('   - DATABASE_URL is wrong (check host, password, database name)')
    console.error('   - the database server is not running')
    console.error('   - a hosted database needs ?sslmode=require at the end of the URL')
    console.error('   - migrations have not been applied yet: npm run db:migrate\n')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

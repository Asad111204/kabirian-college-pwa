/**
 * Creates the first administrator account.
 *
 *   npm run create-admin
 *   npm run create-admin -- --username principal --name "Principal Sahib"
 *
 * The password is generated, shown once, and must be changed at first login.
 * There is no public sign-up anywhere in the system — every account is created
 * by an administrator (ADR-029).
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { hash } from '@node-rs/argon2'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) loadEnvFile('.env')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('\nDATABASE_URL is not set. Copy .env.example to .env and fill it in.\n')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `Kbr-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

async function main() {
  const username = (argValue('--username') ?? 'admin').trim().toLowerCase()
  const fullName = argValue('--name') ?? 'College Administrator'

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  })

  if (existing) {
    console.error(
      `\nA user called "${username}" already exists.\n` +
        `Choose another name:  npm run create-admin -- --username principal\n`,
    )
    process.exit(1)
  }

  const anyOwner = await prisma.user.findFirst({ where: { isSystemOwner: true } })
  const password = generatePassword()

  const passwordHash = await hash(password, {
    algorithm: 2, // Argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true,
      // The very first admin is the protected "system owner" account.
      isSystemOwner: !anyOwner,
    },
  })

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      actorRole: 'ADMIN',
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      entityLabel: username,
      metadata: { createdBy: 'create-admin script', isSystemOwner: user.isSystemOwner },
    },
  })

  console.log(`
============================================================
  Administrator account created
============================================================

  Name          ${fullName}
  Username      ${username}
  Password      ${password}

  ${user.isSystemOwner ? 'This is the protected system-owner account.' : ''}

  WRITE THIS PASSWORD DOWN NOW — it is not stored anywhere
  and cannot be shown again. You must change it the first
  time you sign in.

  Sign in at:   http://localhost:3000/login
============================================================
`)
}

main()
  .catch((error) => {
    console.error('\nCould not create the administrator account:\n', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

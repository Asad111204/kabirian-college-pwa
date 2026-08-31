/**
 * The single PrismaClient instance for the whole application.
 *
 * Prisma 7 connects through a "driver adapter" — a real PostgreSQL driver (pg)
 * rather than a bundled Rust engine. We create one connection pool and reuse it.
 *
 * In development Next.js reloads modules on every edit, which would create a new
 * pool each time and eventually exhaust the database's connection limit — so we
 * cache the client on `globalThis`.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env, isDevelopment } from '../config/env'

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Keep the pool small: hosted free-tier Postgres allows few connections.
    max: env.DATABASE_POOL_MAX,
  })

  return new PrismaClient({
    adapter,
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (isDevelopment) {
  globalForPrisma.prisma = prisma
}

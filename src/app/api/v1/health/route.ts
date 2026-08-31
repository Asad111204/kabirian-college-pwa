import { NextResponse } from 'next/server'
import { prisma } from '@/server/db/prisma'
import { env } from '@/server/config/env'
import { isStorageConfigured } from '@/server/storage/provider'

export const dynamic = 'force-dynamic'

/**
 * Health check.
 *
 * Public on purpose (hosting platforms probe it), so it reveals nothing
 * sensitive: no versions, no connection strings, no record counts.
 */
export async function GET() {
  const checks: Record<string, string> = {}
  let healthy = true

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'unreachable'
    healthy = false
  }

  checks.storage = isStorageConfigured() ? 'configured' : 'not-configured'
  checks.timezone = env.APP_TIMEZONE

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    { status: healthy ? 200 : 503 },
  )
}

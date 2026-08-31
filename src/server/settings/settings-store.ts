/**
 * Typed access to the `settings` table.
 *
 * Settings are values the college can change without a code change or a
 * migration — the college name, whether results show a rank, and from Phase 6
 * the Google Drive connection.
 *
 * One rule matters more than the rest: some settings hold secrets. They are
 * listed in SECRET_SETTING_KEYS and must never appear in a generic "show me all
 * settings" response, in an audit entry, or in a log line. Every reader that
 * returns settings to a browser goes through `listPublicSettings`, which
 * excludes them by construction rather than by remembering to filter.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import type { AuthContext } from '../auth/context'

type PrismaExecutor = Prisma.TransactionClient | typeof prisma

/**
 * Keys whose value is an encrypted secret. Never send these to a browser and
 * never write them into an audit entry.
 */
export const SECRET_SETTING_KEYS = new Set<string>(['google_drive.refresh_token'])

export function isSecretSettingKey(key: string): boolean {
  return SECRET_SETTING_KEYS.has(key)
}

/** Reads one setting, or null when it has never been written. */
export async function readSetting<T>(key: string, executor: PrismaExecutor = prisma): Promise<T | null> {
  const row = await executor.setting.findUnique({ where: { key }, select: { value: true } })
  return row ? (row.value as T) : null
}

/**
 * Serialises a value the way Prisma wants its JSON columns. Callers pass plain
 * objects and are not made to fight Prisma's JSON types.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Creates or updates one setting, recording who changed it. */
export async function writeSetting(
  key: string,
  value: unknown,
  ctx: AuthContext | null,
  options: { description?: string; executor?: PrismaExecutor } = {},
): Promise<void> {
  const executor = options.executor ?? prisma
  await executor.setting.upsert({
    where: { key },
    create: {
      key,
      value: toJson(value),
      description: options.description ?? null,
      updatedByUserId: ctx?.userId ?? null,
    },
    update: {
      value: toJson(value),
      ...(options.description ? { description: options.description } : {}),
      updatedByUserId: ctx?.userId ?? null,
    },
  })
}

/** Removes a setting entirely. Used when disconnecting Drive. */
export async function deleteSetting(key: string, executor: PrismaExecutor = prisma): Promise<void> {
  await executor.setting.deleteMany({ where: { key } })
}

/**
 * Every setting that is safe to show. Secret keys are filtered out here, in one
 * place, so no caller can leak one by forgetting.
 */
export async function listPublicSettings(): Promise<
  Array<{ key: string; value: unknown; description: string | null; updatedAt: Date }>
> {
  const rows = await prisma.setting.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, value: true, description: true, updatedAt: true },
  })
  return rows.filter((row) => !isSecretSettingKey(row.key))
}

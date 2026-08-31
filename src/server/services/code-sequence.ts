/**
 * Human-readable identifiers: STU-0001, ADM-00001, STF-0001.
 *
 * Why not just use the database id? Every record already has a UUID, but nobody
 * can read one out over the phone or write it on an admission form. These codes
 * are the identifier the college actually uses, so they must be unique, stable
 * and never invented by the browser.
 *
 * The counter lives in the `code_sequences` table so an administrator can change
 * the prefix or padding without a code change.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { AppError } from '../api/errors'
import { formatCode } from '@/lib/codes'

// Re-exported so callers can format a code without importing two modules.
export { formatCode }

type PrismaExecutor = Prisma.TransactionClient | typeof prisma

export type CodeSequenceKey = 'STUDENT' | 'STAFF' | 'ADMISSION'

interface SequenceRow {
  prefix: string
  value: number
  padding: number
}

/**
 * Takes the next number from a counter and formats it.
 *
 * The UPDATE ... RETURNING is a single atomic statement: two administrators
 * saving a student at the same moment are handed different numbers by the
 * database itself, with no lock to manage and no chance of a duplicate.
 *
 * Pass the transaction client so the number is only consumed if the surrounding
 * record is actually created.
 */
export async function nextCode(
  key: CodeSequenceKey,
  executor: PrismaExecutor = prisma,
): Promise<string> {
  const rows = await executor.$queryRaw<SequenceRow[]>`
    UPDATE code_sequences
       SET next_value = next_value + 1
     WHERE key = ${key}
    RETURNING prefix, next_value - 1 AS value, padding
  `

  const row = rows[0]
  if (!row) {
    throw new AppError(
      `The "${key}" code sequence is missing. Run "npm run seed:reference" to restore it.`,
      { status: 500, code: 'CODE_SEQUENCE_MISSING' },
    )
  }

  return formatCode(row.prefix, row.value, row.padding)
}

/**
 * Peeks at the next code without consuming it — used to show the administrator
 * what the student's ID will be while they are still filling in the form.
 */
export async function peekNextCode(key: CodeSequenceKey): Promise<string | null> {
  const sequence = await prisma.codeSequence.findUnique({ where: { key } })
  if (!sequence) return null
  return formatCode(sequence.prefix, sequence.nextValue, sequence.padding)
}

/**
 * Turning a notice's or an event's audience into the people who should be
 * told about it (Phase 27).
 *
 * The targeting rules already exist, in `notice-policy.ts`, and decide whether
 * one person may *read* one notice. This asks the same question the other way
 * round — who are all the people this reaches? — because a notification has to
 * be written for each of them at the moment the notice is published.
 *
 * It resolves from the stored targets, so a notice for 1st Year reaches the
 * students of 1st Year and nobody else. If the two ever disagreed the reader
 * would be the one who is right: the page checks for itself, and a
 * notification whose link leads to a refusal is a nuisance, not a leak.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'

type PrismaExecutor = Prisma.TransactionClient | typeof prisma

export interface AudienceTarget {
  audience: 'ALL' | 'STUDENTS' | 'STAFF' | 'CLASS' | 'DIVISION' | 'PROGRAM' | 'GROUP' | 'SECTION'
  classId?: string | null
  divisionId?: string | null
  programId?: string | null
  academicGroupId?: string | null
  sectionId?: string | null
}

/** Every active account belonging to a student who is enrolled somewhere matching. */
async function studentsWhere(where: Prisma.StudentWhereInput, executor: PrismaExecutor): Promise<string[]> {
  const rows = await executor.student.findMany({
    where: { deletedAt: null, status: 'ACTIVE', userId: { not: null }, ...where },
    select: { userId: true },
  })
  return rows.map((r) => r.userId).filter((id): id is string => id !== null)
}

/** Every active account belonging to a member of staff. */
async function allStaffUserIds(executor: PrismaExecutor): Promise<string[]> {
  const rows = await executor.staff.findMany({
    where: { deletedAt: null, userId: { not: null }, user: { status: 'ACTIVE' } },
    select: { userId: true },
  })
  return rows.map((r) => r.userId).filter((id): id is string => id !== null)
}

/**
 * Who a set of targets reaches.
 *
 * The answer is a set, so overlapping targets — "everyone" plus "1st Year" —
 * tell each person once.
 */
export async function recipientsForAudience(targets: readonly AudienceTarget[], executor: PrismaExecutor = prisma): Promise<string[]> {
  const recipients = new Set<string>()

  for (const target of targets) {
    switch (target.audience) {
      case 'ALL': {
        for (const id of await studentsWhere({}, executor)) recipients.add(id)
        for (const id of await allStaffUserIds(executor)) recipients.add(id)
        break
      }
      case 'STUDENTS': {
        for (const id of await studentsWhere({}, executor)) recipients.add(id)
        break
      }
      case 'STAFF': {
        for (const id of await allStaffUserIds(executor)) recipients.add(id)
        break
      }
      case 'CLASS': {
        if (!target.classId) break
        for (const id of await studentsWhere(
          { enrollments: { some: { status: 'ACTIVE', section: { academicGroup: { classId: target.classId } } } } },
          executor,
        )) {
          recipients.add(id)
        }
        break
      }
      case 'DIVISION': {
        if (!target.divisionId) break
        for (const id of await studentsWhere(
          { enrollments: { some: { status: 'ACTIVE', section: { academicGroup: { divisionId: target.divisionId } } } } },
          executor,
        )) {
          recipients.add(id)
        }
        break
      }
      case 'PROGRAM': {
        if (!target.programId) break
        for (const id of await studentsWhere(
          { enrollments: { some: { status: 'ACTIVE', section: { academicGroup: { programId: target.programId } } } } },
          executor,
        )) {
          recipients.add(id)
        }
        break
      }
      case 'GROUP': {
        if (!target.academicGroupId) break
        for (const id of await studentsWhere(
          { enrollments: { some: { status: 'ACTIVE', section: { academicGroupId: target.academicGroupId } } } },
          executor,
        )) {
          recipients.add(id)
        }
        break
      }
      case 'SECTION': {
        if (!target.sectionId) break
        for (const id of await studentsWhere({ enrollments: { some: { status: 'ACTIVE', sectionId: target.sectionId } } }, executor)) {
          recipients.add(id)
        }
        break
      }
    }
  }

  return [...recipients]
}

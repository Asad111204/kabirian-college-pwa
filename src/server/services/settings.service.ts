/**
 * College-wide settings the office can change from the Settings page.
 *
 * Reading a rule needs no permission — the attendance service reads it on
 * every edit — but changing one needs the ADMIN role and `settings.manage`,
 * and is audited with the old and new values.
 */
import 'server-only'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { readSetting, writeSetting } from '../settings/settings-store'
import { assertAdminArea } from './service-utils'
import {
  ATTENDANCE_CORRECTION_DAYS_DEFAULT,
  SETTING_LEAVE_COUNTS_AS_PRESENT,
  SETTING_TEACHER_CORRECTION_DAYS,
  type AttendanceRulesInput,
} from '@/validation/settings'

export interface AttendanceRules {
  teacherCorrectionDays: number
  leaveCountsAsPresent: boolean
}

/** The rules as they stand, with the defaults where nothing has been set. */
export async function getAttendanceRules(): Promise<AttendanceRules> {
  const [days, leave] = await Promise.all([
    readSetting<number>(SETTING_TEACHER_CORRECTION_DAYS),
    readSetting<boolean>(SETTING_LEAVE_COUNTS_AS_PRESENT),
  ])
  return {
    teacherCorrectionDays: typeof days === 'number' && Number.isInteger(days) && days >= 0 ? days : ATTENDANCE_CORRECTION_DAYS_DEFAULT,
    leaveCountsAsPresent: leave === true,
  }
}

/** The rules for the Settings page: the office only. */
export async function getAttendanceRulesForAdmin(ctx: AuthContext): Promise<AttendanceRules> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')
  return getAttendanceRules()
}

export async function updateAttendanceRules(ctx: AuthContext, input: AttendanceRulesInput): Promise<AttendanceRules> {
  assertAdminArea(ctx, 'Settings')
  authorize(ctx, 'settings.manage')

  const before = await getAttendanceRules()
  await prisma.$transaction(async (tx) => {
    await writeSetting(SETTING_TEACHER_CORRECTION_DAYS, input.teacherCorrectionDays, ctx, {
      description: 'Days a teacher may correct a submitted register; 0 = office only',
      executor: tx,
    })
    await writeSetting(SETTING_LEAVE_COUNTS_AS_PRESENT, input.leaveCountsAsPresent, ctx, {
      description: 'Whether LEAVE counts towards the attendance percentage',
      executor: tx,
    })
    await writeAuditLog(
      ctx,
      {
        action: 'settings.updated',
        entityType: 'setting',
        entityLabel: 'Attendance rules',
        before,
        after: { teacherCorrectionDays: input.teacherCorrectionDays, leaveCountsAsPresent: input.leaveCountsAsPresent },
      },
      tx,
    )
  })
  return getAttendanceRules()
}

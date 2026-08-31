import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getAttendanceSheet, markAttendance } from '@/server/services/attendance.service'
import { attendanceSheetMarkSchema } from '@/validation/attendance'

/**
 * GET /api/v1/attendance/sheets/[id]
 *
 * One register with its marks: the section, subject, date, period, who marked
 * it, its status, and every student on it. Authorised first — a teacher only
 * sees registers for sections they teach in or are in charge of.
 */
export const GET = withAuth(async ({ ctx, params }) => {
  return jsonOk(await getAttendanceSheet(ctx, params.id ?? ''))
})

/**
 * PATCH /api/v1/attendance/sheets/[id] — mark several students at once.
 *
 * What a teacher's screen sends when they finish calling the register. Every
 * student id must already be on this sheet; an unknown one is refused rather
 * than quietly skipped, so a mistake is visible.
 *
 * There is deliberately no DELETE on this route. Attendance is never destroyed —
 * a class that did not happen is cancelled instead, which keeps the record.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, attendanceSheetMarkSchema)
  const sheet = await markAttendance(ctx, params.id ?? '', input.entries, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk(sheet)
})

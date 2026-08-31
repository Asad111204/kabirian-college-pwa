import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { submitAttendanceSheet } from '@/server/services/attendance.service'

/**
 * POST /api/v1/attendance/sheets/[id]/submit
 *
 * Hands a register in. From this point it counts towards every percentage, and
 * the teacher can no longer change it — only the office can, and only with the
 * `attendance.update_submitted` permission.
 *
 * Refused unless the sheet is still a draft, has entries, and every student
 * currently enrolled in the section has a mark.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const sheet = await submitAttendanceSheet(ctx, params.id ?? '', {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk(sheet)
})

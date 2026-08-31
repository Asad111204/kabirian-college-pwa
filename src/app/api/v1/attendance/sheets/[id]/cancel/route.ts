import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { cancelAttendanceSheet } from '@/server/services/attendance.service'
import { attendanceCancelSchema } from '@/validation/attendance'

/**
 * POST /api/v1/attendance/sheets/[id]/cancel
 *
 * Records that the class did not happen — a holiday, an exam, a cancelled
 * period. The sheet stops counting towards anybody's percentage, its entries are
 * kept, and the reason is required so a gap in the register is explained rather
 * than mysterious.
 *
 * This is the closest thing to a delete that attendance has, and it is not one:
 * nothing is removed.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, attendanceCancelSchema)
  const sheet = await cancelAttendanceSheet(ctx, params.id ?? '', input.cancelledReason, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk(sheet)
})

import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { updateAttendanceEntry } from '@/server/services/attendance.service'
import { attendanceEntryUpdateSchema } from '@/validation/attendance'

/**
 * PATCH /api/v1/attendance/entries/[id] — change one student's mark.
 *
 * The sheet is loaded from the entry, so the caller cannot claim the entry
 * belongs to a register they are allowed to touch. A status change on a
 * submitted register writes a before/after audit entry naming the student code
 * and the two statuses — and nothing else, because a remark may say why a
 * student was away.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, attendanceEntryUpdateSchema)
  const entry = await updateAttendanceEntry(ctx, params.id ?? '', input, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk(entry)
})

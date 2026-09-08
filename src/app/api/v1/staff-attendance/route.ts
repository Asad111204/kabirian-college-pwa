import { clientIp, jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getStaffAttendanceDay, saveStaffAttendance } from '@/server/services/staff-attendance.service'
import { staffAttendanceDayQuerySchema, staffAttendanceSaveSchema } from '@/validation/staff-attendance'

/** GET /api/v1/staff-attendance?date=…&departmentId=…&staffType=… — one day's register. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = staffAttendanceDayQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  return jsonOk(await getStaffAttendanceDay(ctx, parsed.data))
})

/** PUT /api/v1/staff-attendance — save one day's marks. */
export const PUT = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, staffAttendanceSaveSchema)
  return jsonOk(await saveStaffAttendance(ctx, input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})

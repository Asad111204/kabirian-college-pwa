import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getStaffAttendanceMonth } from '@/server/services/staff-attendance.service'
import { staffAttendanceMonthQuerySchema } from '@/validation/staff-attendance'

/** GET /api/v1/staff-attendance/month?month=…— one row per staff member, counted. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = staffAttendanceMonthQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  return jsonOk(await getStaffAttendanceMonth(ctx, parsed.data))
})

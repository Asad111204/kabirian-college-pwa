import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getMyStaffAttendance } from '@/server/services/staff-attendance.service'
import { myStaffAttendanceQuerySchema } from '@/validation/staff-attendance'

/** GET /api/v1/staff-portal/my-attendance?month=… — the caller's own record, and nobody else's. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = myStaffAttendanceQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('That is not a valid month.', zodFieldErrors(parsed.error))
  return jsonOk(await getMyStaffAttendance(ctx, parsed.data))
})

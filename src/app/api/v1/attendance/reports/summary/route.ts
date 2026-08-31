import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getAttendanceOverview } from '@/server/services/attendance-report.service'
import { attendanceReportFilterSchema } from '@/validation/attendance'

/**
 * GET /api/v1/attendance/reports/summary
 *
 * Overall figures and the breakdowns by class, division, program, section and
 * subject — all from one grouped query, counted by the database.
 *
 * An administrator sees the college; a teacher sees only their own subjects and
 * the sections they are in charge of, because the scope clause is ANDed into the
 * same query rather than applied afterwards.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = attendanceReportFilterSchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Please check the report filters.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getAttendanceOverview(ctx, parsed.data))
})

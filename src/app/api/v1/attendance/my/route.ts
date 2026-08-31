import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getMyAttendance } from '@/server/services/attendance.service'
import { myAttendanceQuerySchema } from '@/validation/attendance'

/**
 * GET /api/v1/attendance/my
 *
 * A student's own attendance: overall percentage, a breakdown by subject, and
 * their recent marks.
 *
 * There is no student id in this route, in the query schema, or in the service
 * it calls. The student is resolved from the signed-in session, so there is
 * nothing an address bar could override — the usual "change the id and see
 * somebody else's record" attack has no parameter to attack.
 *
 * Accepts `page`, `pageSize`, `subject` (a subject id or 'DAILY'), `status` and
 * a date range. Summaries are counted by the database and the history is
 * paginated, so a student with three years of attendance never loads all of it.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = myAttendanceQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Invalid options.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getMyAttendance(ctx, parsed.data))
})

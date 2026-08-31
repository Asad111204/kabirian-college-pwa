import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getStudentAttendanceReport } from '@/server/services/attendance-report.service'
import { studentReportQuerySchema } from '@/validation/attendance'

/**
 * GET /api/v1/attendance/reports/students
 *
 * Attendance per student, counted in the database and paginated. Sorting by
 * percentage happens in SQL, so the lowest attendance in the whole selection
 * reaches page one rather than the lowest on the current page.
 *
 * Only safe identity fields come back: student code and name.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = studentReportQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Please check the report filters.', zodFieldErrors(parsed.error))
  }
  const { page, pageSize, sort, ...filters } = parsed.data
  return jsonOk(await getStudentAttendanceReport(ctx, filters, { page, pageSize, sort }))
})

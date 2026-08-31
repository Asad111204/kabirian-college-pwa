import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getRegisterReport } from '@/server/services/attendance-report.service'
import { registerReportQuerySchema } from '@/validation/attendance'

/**
 * GET /api/v1/attendance/reports/registers
 *
 * Which registers were taken and by whom — teacher activity for the office, and
 * their own history for a teacher, since the same scope clause narrows both.
 *
 * Built from the attendance tables alone. The audit log is not read here and no
 * audit payload is ever returned.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = registerReportQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Please check the report filters.', zodFieldErrors(parsed.error))
  }
  const { page, pageSize, ...filters } = parsed.data
  return jsonOk(await getRegisterReport(ctx, filters, { page, pageSize }))
})

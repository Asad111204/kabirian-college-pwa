import { clientIp, jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import {
  createAttendanceSheet,
  listAttendanceSheets,
} from '@/server/services/attendance.service'
import {
  attendanceSheetCreateSchema,
  attendanceSheetListQuerySchema,
} from '@/validation/attendance'

/**
 * GET /api/v1/attendance/sheets
 *
 * Registers, filtered on the server by session, section, subject, teacher,
 * status, date or date range.
 *
 * Returns sheet metadata only — never the individual marks. A month of
 * registers for a section is a few dozen rows; the same request with every
 * student's mark attached would be thousands.
 *
 * A teacher's results are additionally narrowed to their own sections inside the
 * service, so asking for another section's id returns nothing rather than
 * somebody else's register.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = attendanceSheetListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listAttendanceSheets(ctx, parsed.data))
})

/**
 * POST /api/v1/attendance/sheets — open a register.
 *
 * Creates the sheet and one entry per student currently enrolled in the section,
 * in one transaction. The roster is built on the server from active enrollments;
 * the academic session is taken from the section, not from the request.
 *
 * The sheet starts as a DRAFT and counts towards nothing until it is submitted.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, attendanceSheetCreateSchema)
  const sheet = await createAttendanceSheet(ctx, input, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk(sheet, 201)
})

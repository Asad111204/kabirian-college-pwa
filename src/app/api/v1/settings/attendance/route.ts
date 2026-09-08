import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getAttendanceRulesForAdmin, updateAttendanceRules } from '@/server/services/settings.service'
import { attendanceRulesSchema } from '@/validation/settings'

/** GET /api/v1/settings/attendance — the college's attendance rules (office only). */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getAttendanceRulesForAdmin(ctx)))

/** PUT /api/v1/settings/attendance — change them; audited. */
export const PUT = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, attendanceRulesSchema)
  return jsonOk(await updateAttendanceRules(ctx, input))
})

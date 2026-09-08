import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getFeeRulesForAdmin, updateFeeRules } from '@/server/services/fees.service'
import { feeRulesSchema } from '@/validation/fees'

/** GET /api/v1/fees/rules — the due day of the month and the late fine. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getFeeRulesForAdmin(ctx)))

/** PUT /api/v1/fees/rules — change them. */
export const PUT = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, feeRulesSchema)
  return jsonOk(await updateFeeRules(ctx, input))
})

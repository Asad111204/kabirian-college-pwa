import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { runVouchers } from '@/server/services/fees.service'
import { voucherRunSchema } from '@/validation/fees'

/** POST /api/v1/fees/run — issue a month's vouchers, or say what that would do. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, voucherRunSchema)
  return jsonOk(await runVouchers(ctx, input))
})

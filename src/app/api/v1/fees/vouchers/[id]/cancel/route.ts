import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { cancelVoucher } from '@/server/services/fees.service'
import { voucherCancelSchema } from '@/validation/fees'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid voucher.')
  return parsed.data
}

/** POST /api/v1/fees/vouchers/:id/cancel — withdraw a voucher issued in error. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, voucherCancelSchema)
  return jsonOk(await cancelVoucher(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})

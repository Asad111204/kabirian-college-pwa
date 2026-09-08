import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { recordPayment } from '@/server/services/fees.service'
import { feePaymentSchema } from '@/validation/fees'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid voucher.')
  return parsed.data
}

/** POST /api/v1/fees/vouchers/:id/payments — record money received. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, feePaymentSchema)
  return jsonOk(
    await recordPayment(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }),
    201,
  )
})

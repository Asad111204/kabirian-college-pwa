import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { voidPayment } from '@/server/services/fees.service'
import { feePaymentVoidSchema } from '@/validation/fees'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid payment.')
  return parsed.data
}

/** POST /api/v1/fees/payments/:id/void — undo a payment recorded in error. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, feePaymentVoidSchema)
  return jsonOk(await voidPayment(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})

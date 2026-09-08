import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getVoucher } from '@/server/services/fees.service'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid voucher.')
  return parsed.data
}

/** GET /api/v1/fees/vouchers/:id — one voucher with its payments. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getVoucher(ctx, idOf(params.id))))

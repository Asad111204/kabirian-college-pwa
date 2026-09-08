import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { listVouchers } from '@/server/services/fees.service'
import { voucherListQuerySchema } from '@/validation/fees'

/** GET /api/v1/fees/vouchers — the office's list. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = voucherListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listVouchers(ctx, parsed.data))
})

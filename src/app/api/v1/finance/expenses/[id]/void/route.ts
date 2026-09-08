import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { voidExpense } from '@/server/services/finance.service'
import { expenseVoidSchema } from '@/validation/finance'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid expense.')
  return parsed.data
}

/** POST /api/v1/finance/expenses/:id/void — undo one recorded in error. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, expenseVoidSchema)
  return jsonOk(await voidExpense(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})

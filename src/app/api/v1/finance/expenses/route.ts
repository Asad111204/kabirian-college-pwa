import { clientIp, jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { listExpenses, recordExpense } from '@/server/services/finance.service'
import { expenseCreateSchema, expenseListQuerySchema } from '@/validation/finance'

/** GET /api/v1/finance/expenses — what the college has spent. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = expenseListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listExpenses(ctx, parsed.data))
})

/** POST /api/v1/finance/expenses — record one. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, expenseCreateSchema)
  return jsonOk(await recordExpense(ctx, input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }), 201)
})

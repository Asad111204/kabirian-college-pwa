import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getFinanceSummary } from '@/server/services/finance.service'
import { financeSummaryQuerySchema } from '@/validation/finance'

/** GET /api/v1/finance/summary — a month, and a year of history for the graph. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = financeSummaryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid options.', zodFieldErrors(parsed.error))
  return jsonOk(await getFinanceSummary(ctx, parsed.data))
})

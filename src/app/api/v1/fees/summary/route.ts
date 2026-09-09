import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getFeeSessionSummary } from '@/server/services/fees.service'
import { uuid } from '@/validation/common'

/** GET /api/v1/fees/summary?academicSessionId=… — what a year came to. */
export const GET = withAuth(async ({ request, ctx }) => {
  const raw = new URL(request.url).searchParams.get('academicSessionId')
  if (!raw) return jsonOk(await getFeeSessionSummary(ctx))

  const parsed = uuid.safeParse(raw)
  if (!parsed.success) throw new ValidationError('That is not a valid academic session.')
  return jsonOk(await getFeeSessionSummary(ctx, parsed.data))
})

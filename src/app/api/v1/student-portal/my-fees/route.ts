import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getMyFees } from '@/server/services/fees.service'
import { myFeesQuerySchema } from '@/validation/fees'

/** GET /api/v1/student-portal/my-fees — a student's own vouchers, and only theirs. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = myFeesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await getMyFees(ctx, parsed.data))
})

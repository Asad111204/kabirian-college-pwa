import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { getMyNoticeFeed } from '@/server/services/notices.service'
import { ValidationError } from '@/server/api/errors'
import { noticeFeedQuerySchema } from '@/validation/notices'

/**
 * GET /api/v1/notices/feed -- the notices that reach the signed-in reader now.
 *
 * Who the reader is comes from the session. There is no parameter for a
 * section, a student or a status: the only narrowing is by category.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = noticeFeedQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getMyNoticeFeed(ctx, parsed.data))
})

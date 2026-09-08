import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getMyHomeworkFeed } from '@/server/services/homework.service'
import { homeworkFeedQuerySchema } from '@/validation/homework'

/** GET /api/v1/homework/feed — a student's own section's homework, soonest due first. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = homeworkFeedQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid options.', zodFieldErrors(parsed.error))
  return jsonOk(await getMyHomeworkFeed(ctx, parsed.data))
})

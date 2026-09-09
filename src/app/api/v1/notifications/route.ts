import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { listNotifications } from '@/server/services/notifications.service'
import { notificationListQuerySchema } from '@/validation/notifications'

/** GET /api/v1/notifications — a person's own list, and only their own. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listNotifications(ctx, parsed.data))
})

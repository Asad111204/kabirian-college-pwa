import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { markAllNotificationsRead } from '@/server/services/notifications.service'
import { notificationReadAllSchema } from '@/validation/notifications'

/** POST /api/v1/notifications/read-all — clear everything, or one part of the college. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, notificationReadAllSchema)
  return jsonOk(await markAllNotificationsRead(ctx, input.kind))
})

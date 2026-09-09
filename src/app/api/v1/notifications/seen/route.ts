import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { z } from 'zod'
import { getNotificationSummary, markReadForPath } from '@/server/services/notifications.service'

/**
 * POST /api/v1/notifications/seen — "I have just opened this page."
 *
 * Whatever was unread for that part of the college is marked read, which is
 * what takes the red dot off the button. The path is only ever used to look
 * up which kinds live under it; it is never followed or echoed back.
 */
const seenSchema = z.object({
  path: z.string().max(300).refine((p) => p.startsWith('/') && !p.startsWith('//'), 'Not a path inside the app.'),
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, seenSchema)
  await markReadForPath(ctx, input.path)
  return jsonOk(await getNotificationSummary(ctx))
})

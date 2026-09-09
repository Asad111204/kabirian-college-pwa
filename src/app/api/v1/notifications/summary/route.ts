import { jsonOk, withAuth } from '@/server/api/handler'
import { getNotificationSummary } from '@/server/services/notifications.service'

/**
 * GET /api/v1/notifications/summary — what is unread, per part of the college.
 *
 * Read on a timer by every signed-in page, so it is deliberately two queries
 * and no joins.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getNotificationSummary(ctx)))

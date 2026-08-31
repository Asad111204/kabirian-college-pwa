import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { submitMarkSheet } from '@/server/services/marks.service'

/**
 * Hands the sheet in. There is deliberately no way to undo this from the staff
 * portal — a correction afterwards needs `marks.update_submitted`.
 */
export const POST = withAuth(async ({ request, ctx, params }) =>
  jsonOk(
    await submitMarkSheet(ctx, params.id!, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
  ),
)

import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { openMarkSheet } from '@/server/services/marks.service'
import { openMarkSheetSchema } from '@/validation/marks'

/** Opens the mark sheet for one paper and section, or returns the existing one. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, openMarkSheetSchema)
  return jsonOk(
    await openMarkSheet(ctx, input, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
    201,
  )
})

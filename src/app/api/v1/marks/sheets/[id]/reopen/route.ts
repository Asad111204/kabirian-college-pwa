import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { reopenMarkSheet } from '@/server/services/marks.service'
import { markSheetReopenSchema } from '@/validation/exams'

/**
 * POST /api/v1/marks/sheets/[id]/reopen — the office lets one teacher back
 * into one mark sheet after the exam's deadline, until a stated day and for a
 * stated reason. The sheet's status is unchanged; the reason is kept on the row.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, markSheetReopenSchema)
  return jsonOk(
    await reopenMarkSheet(ctx, params.id ?? '', input, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
  )
})

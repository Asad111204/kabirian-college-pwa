import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getMarkSheet, saveMarks } from '@/server/services/marks.service'
import { saveMarksSchema } from '@/validation/marks'

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getMarkSheet(ctx, params.id!)))

/** Saves the whole sheet in one atomic request. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, saveMarksSchema)
  return jsonOk(
    await saveMarks(ctx, params.id!, input, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
  )
})

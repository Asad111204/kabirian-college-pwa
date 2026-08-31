import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setResultsPublished } from '@/server/services/results.service'
import { publishResultsSchema } from '@/validation/results'

/** Makes an exam's current results visible, or takes them back. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, publishResultsSchema)
  return jsonOk(
    await setResultsPublished(ctx, params.id!, input.publish, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
  )
})

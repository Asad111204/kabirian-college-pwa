import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { generateResults } from '@/server/services/results.service'
import { generateResultsSchema } from '@/validation/results'

/**
 * Works out every student's result for one exam, atomically.
 *
 * Refused while any required mark sheet is unsubmitted, and refused a second
 * time unless `regenerate` is explicit — an existing result is superseded, never
 * overwritten.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, generateResultsSchema)
  return jsonOk(
    await generateResults(ctx, params.id!, input, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }),
  )
})

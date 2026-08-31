import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setDateSheetPublished } from '@/server/services/exams.service'
import { dateSheetPublishSchema } from '@/validation/exams'

/**
 * Publishes the date sheet, or withdraws it again.
 *
 * Withdrawing is deliberately the same explicit, audited action as publishing —
 * a schedule teachers and students may already have seen is never reopened as a
 * side effect of editing something else.
 */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, dateSheetPublishSchema)
  return jsonOk(await setDateSheetPublished(ctx, params.id!, input.publish))
})

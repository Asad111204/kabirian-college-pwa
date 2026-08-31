import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import {
  getGenerationPreview,
  getResultSummary,
  listResults,
} from '@/server/services/results.service'
import { resultListQuerySchema } from '@/validation/results'

/** One page of results, with the summary and the generation preview beside it. */
export const GET = withAuth(async ({ request, ctx, params }) => {
  const search = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = resultListQuerySchema.safeParse(search)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }

  const examId = params.id!
  const [results, summary, preview] = await Promise.all([
    listResults(ctx, examId, parsed.data),
    getResultSummary(ctx, examId),
    getGenerationPreview(ctx, examId),
  ])

  return jsonOk({ results, summary, preview })
})

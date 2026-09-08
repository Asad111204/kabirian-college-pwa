import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { setMarksDeadline } from '@/server/services/exams.service'
import { marksDeadlineSchema } from '@/validation/exams'

/**
 * PUT /api/v1/exams/[id]/marks-deadline — the office sets or clears the last
 * college day on which teachers may enter or correct marks for this exam.
 * An empty value clears it. Audited with the old and new dates.
 */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, marksDeadlineSchema)
  return jsonOk(await setMarksDeadline(ctx, params.id ?? '', input))
})

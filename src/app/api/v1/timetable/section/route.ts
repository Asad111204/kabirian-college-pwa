import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { getSectionTimetable } from '@/server/services/timetable.service'
import { ValidationError } from '@/server/api/errors'
import { sectionTimetableQuerySchema } from '@/validation/timetable'

/**
 * One section's week, plus what the builder is allowed to put in it: the
 * section's curriculum, and under each subject the teachers holding an ACTIVE
 * assignment for that section and subject.
 *
 * A read helper for the builder. Administrators only — the service checks.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = sectionTimetableQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getSectionTimetable(ctx, parsed.data.sectionId))
})

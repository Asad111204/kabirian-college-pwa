import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import {
  getPublishedResultsForTeacher,
  getTeacherResultOptions,
} from '@/server/services/results.service'
import { teacherResultQuerySchema } from '@/validation/results'

/**
 * The published results the signed-in teacher may see.
 *
 * The staff record comes from the session; the filters below can only narrow
 * what their ACTIVE assignments already allow.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const search = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = teacherResultQuerySchema.safeParse(search)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }

  const [results, options] = await Promise.all([
    getPublishedResultsForTeacher(ctx, parsed.data),
    getTeacherResultOptions(ctx),
  ])

  return jsonOk({ results, options })
})

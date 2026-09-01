import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { getMyTimetable } from '@/server/services/timetable.service'
import { ValidationError } from '@/server/api/errors'
import { myTimetableQuerySchema } from '@/validation/timetable'

/**
 * The signed-in teacher's own week.
 *
 * There is no parameter for whose timetable it is. The service resolves the
 * teacher from `ctx.staffId`, so a `?staffId=` on this URL is parsed away and
 * has no effect — the endpoint cannot be pointed at anybody else however the
 * request is written. The session and day are filters within their own week.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = myTimetableQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getMyTimetable(ctx, parsed.data))
})

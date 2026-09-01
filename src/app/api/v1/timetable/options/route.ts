import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { getTimetableOptions } from '@/server/services/timetable.service'
import { ValidationError } from '@/server/api/errors'
import { timetableOptionsQuerySchema } from '@/validation/timetable'

/**
 * The sessions an administrator may build a timetable for, and the sections of
 * the one being looked at. `?sessionId=` chooses; the current session is the
 * default.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = timetableOptionsQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getTimetableOptions(ctx, parsed.data.sessionId))
})

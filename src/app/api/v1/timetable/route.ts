import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { createTimetableSlot, getSectionTimetable } from '@/server/services/timetable.service'
import { ValidationError } from '@/server/api/errors'
import { timetableQuerySchema, timetableSlotCreateSchema } from '@/validation/timetable'

/**
 * The master timetable, for administrators only.
 *
 * The service enforces `timetable.view` / `timetable.manage` **and** the admin
 * area; these routes only parse. Teachers use /api/v1/timetable/my, which is a
 * different service function with a different scope.
 */

export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = timetableQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await getSectionTimetable(ctx, parsed.data.sectionId))
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, timetableSlotCreateSchema)
  return jsonOk(await createTimetableSlot(ctx, input), 201)
})

import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { createTimetableSlot, listTimetable } from '@/server/services/timetable.service'
import { ValidationError } from '@/server/api/errors'
import { timetableListQuerySchema, timetableSlotCreateSchema } from '@/validation/timetable'

/**
 * The master timetable, for administrators only.
 *
 * The service enforces `timetable.view` / `timetable.manage` **and** the admin
 * area; these routes only parse. Teachers use /api/v1/timetable/my, which is a
 * different service function with a different scope.
 */

export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = timetableListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listTimetable(ctx, parsed.data))
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, timetableSlotCreateSchema)
  return jsonOk(await createTimetableSlot(ctx, input), 201)
})

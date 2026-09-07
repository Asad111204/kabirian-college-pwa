import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { createEvent, listEvents } from '@/server/services/events.service'
import { ValidationError } from '@/server/api/errors'
import { eventCreateSchema, eventListQuerySchema } from '@/validation/notices'

/** GET /api/v1/events -- the office's list, every status. Admin only. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = eventListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listEvents(ctx, parsed.data))
})

/** POST /api/v1/events -- create an event. It starts as a draft. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, eventCreateSchema)
  return jsonOk(await createEvent(ctx, input), 201)
})

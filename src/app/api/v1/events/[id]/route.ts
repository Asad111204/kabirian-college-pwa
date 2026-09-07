import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { deleteEvent, getEvent, setEventStatus, updateEvent } from '@/server/services/events.service'
import { eventStatusSchema, eventUpdateSchema } from '@/validation/notices'

/** GET /api/v1/events/[id] -- one event as the office sees it. Admin only. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getEvent(ctx, params.id!)))

/** PUT /api/v1/events/[id] -- replace the details. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, eventUpdateSchema)
  return jsonOk(await updateEvent(ctx, params.id!, input))
})

/** PATCH /api/v1/events/[id] -- draft, publish or cancel. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const { status } = await parseJsonBody(request, eventStatusSchema)
  return jsonOk(await setEventStatus(ctx, params.id!, status))
})

/** DELETE /api/v1/events/[id] -- a draft only. A published event is cancelled. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteEvent(ctx, params.id!)
  return jsonOk({ deleted: true })
})

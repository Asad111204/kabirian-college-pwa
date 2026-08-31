import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { clearTimetableSlot, updateTimetableSlot } from '@/server/services/timetable.service'
import { timetableSlotUpdateSchema } from '@/validation/timetable'

/** One lesson. Administrators only — the service checks, not this file. */

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, timetableSlotUpdateSchema)
  return jsonOk(await updateTimetableSlot(ctx, params.id!, input))
})

/** Empties the cell. The row is deactivated, not deleted, so it stays auditable. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await clearTimetableSlot(ctx, params.id!)
  return jsonOk({ cleared: true })
})

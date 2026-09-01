import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deactivateTimetableSlot,
  getTimetableSlot,
  updateTimetableSlot,
} from '@/server/services/timetable.service'
import { timetableSlotUpdateSchema } from '@/validation/timetable'

/** One lesson. Administrators only — the service checks, not this file. */

export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getTimetableSlot(ctx, params.id!)))

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, timetableSlotUpdateSchema)
  return jsonOk(await updateTimetableSlot(ctx, params.id!, input))
})

/**
 * Empties the cell.
 *
 * DELETE is the verb the project uses for "remove this from the working set",
 * and it never means a database DELETE here: the row is deactivated so the
 * change stays auditable, and the partial unique indexes — which count active
 * rows only — free the section, teacher and room cells for reuse.
 */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deactivateTimetableSlot(ctx, params.id!)
  return jsonOk({ deactivated: true })
})

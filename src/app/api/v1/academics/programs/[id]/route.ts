import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteProgram,
  setProgramActive,
  updateProgram,
} from '@/server/services/academic-blocks.service'
import { programUpdateSchema, setActiveSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, programUpdateSchema)
  return jsonOk(await updateProgram(ctx, params.id!, input))
})

/** Activate / deactivate — the safe alternative to deleting. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setProgramActive(ctx, params.id!, input.isActive))
})

/** Only succeeds when nothing references the program (requirement 15). */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteProgram(ctx, params.id!)
  return jsonOk({ deleted: true })
})

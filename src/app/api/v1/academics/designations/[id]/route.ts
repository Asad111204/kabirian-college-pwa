import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteDesignation,
  setDesignationActive,
  updateDesignation,
} from '@/server/services/reference-data.service'
import { designationCreateSchema } from '@/validation/staff'
import { setActiveSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, designationCreateSchema)
  return jsonOk(await updateDesignation(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setDesignationActive(ctx, params.id!, input.isActive))
})

/** Only succeeds when no staff member holds this designation. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteDesignation(ctx, params.id!)
  return jsonOk({ deleted: true })
})

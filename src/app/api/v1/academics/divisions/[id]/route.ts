import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteDivision,
  setDivisionActive,
  updateDivision,
} from '@/server/services/academic-blocks.service'
import { divisionUpdateSchema, setActiveSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, divisionUpdateSchema)
  return jsonOk(await updateDivision(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setDivisionActive(ctx, params.id!, input.isActive))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteDivision(ctx, params.id!)
  return jsonOk({ deleted: true })
})

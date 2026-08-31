import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { deleteClass, setClassActive, updateClass } from '@/server/services/academic-blocks.service'
import { classUpdateSchema, setActiveSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, classUpdateSchema)
  return jsonOk(await updateClass(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setClassActive(ctx, params.id!, input.isActive))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteClass(ctx, params.id!)
  return jsonOk({ deleted: true })
})

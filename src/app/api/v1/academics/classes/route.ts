import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createClass, listClasses } from '@/server/services/academic-blocks.service'
import { classCreateSchema } from '@/validation/academics'

export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  return jsonOk(
    await listClasses(ctx, {
      includeInactive: params.get('includeInactive') === 'true',
      search: params.get('search') ?? undefined,
    }),
  )
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, classCreateSchema)
  return jsonOk(await createClass(ctx, input), 201)
})

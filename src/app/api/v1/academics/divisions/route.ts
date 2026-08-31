import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createDivision, listDivisions } from '@/server/services/academic-blocks.service'
import { divisionCreateSchema } from '@/validation/academics'

export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  return jsonOk(
    await listDivisions(ctx, { includeInactive: params.get('includeInactive') === 'true' }),
  )
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, divisionCreateSchema)
  return jsonOk(await createDivision(ctx, input), 201)
})

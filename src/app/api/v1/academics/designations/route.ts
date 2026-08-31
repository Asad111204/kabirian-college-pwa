import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createDesignation, listDesignations } from '@/server/services/reference-data.service'
import { designationCreateSchema } from '@/validation/staff'

export const GET = withAuth(async ({ request, ctx }) =>
  jsonOk(
    await listDesignations(ctx, {
      includeInactive: new URL(request.url).searchParams.get('includeInactive') === 'true',
    }),
  ),
)

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, designationCreateSchema)
  return jsonOk(await createDesignation(ctx, input), 201)
})

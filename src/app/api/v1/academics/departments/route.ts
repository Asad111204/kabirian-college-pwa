import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createDepartment, listDepartments } from '@/server/services/reference-data.service'
import { departmentCreateSchema } from '@/validation/staff'

export const GET = withAuth(async ({ request, ctx }) =>
  jsonOk(
    await listDepartments(ctx, {
      includeInactive: new URL(request.url).searchParams.get('includeInactive') === 'true',
    }),
  ),
)

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, departmentCreateSchema)
  return jsonOk(await createDepartment(ctx, input), 201)
})

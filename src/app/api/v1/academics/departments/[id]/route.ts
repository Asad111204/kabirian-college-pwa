import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteDepartment,
  setDepartmentActive,
  updateDepartment,
} from '@/server/services/reference-data.service'
import { departmentCreateSchema } from '@/validation/staff'
import { setActiveSchema } from '@/validation/academics'

export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, departmentCreateSchema)
  return jsonOk(await updateDepartment(ctx, params.id!, input))
})

export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, setActiveSchema)
  return jsonOk(await setDepartmentActive(ctx, params.id!, input.isActive))
})

export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteDepartment(ctx, params.id!)
  return jsonOk({ deleted: true })
})

import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { setAdminAccess } from '@/server/services/users.service'
import { adminAccessSchema } from '@/validation/users'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid user.')
  return parsed.data
}

/** PATCH /api/v1/users/:id/admin-access — give a staff account the office portal, or take it back. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, adminAccessSchema)
  return jsonOk(await setAdminAccess(ctx, idOf(params.id), input.adminAccess))
})

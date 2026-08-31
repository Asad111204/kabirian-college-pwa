import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { createStaff, listStaff } from '@/server/services/staff.service'
import { staffCreateSchema, staffListQuerySchema } from '@/validation/staff'

/** Searched, filtered and paginated on the server. Administrators only. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = staffListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listStaff(ctx, parsed.data))
})

/**
 * Adds a staff member, optionally with a portal login created in the same
 * transaction. A new account's temporary password is in this response once and
 * is never stored in readable form.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, staffCreateSchema)
  return jsonOk(await createStaff(ctx, input), 201)
})

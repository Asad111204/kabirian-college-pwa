import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { createUser, listUsers } from '@/server/services/users.service'
import { userCreateSchema, userListQuerySchema } from '@/validation/users'

/** GET /api/v1/users — searched, filtered and paginated on the server. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = userListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  }

  return jsonOk(await listUsers(ctx, parsed.data))
})

/**
 * POST /api/v1/users — create an account.
 *
 * The response contains the generated temporary password. That is the only time
 * it is ever readable: it is stored as an Argon2id hash and never logged or
 * written to the audit trail.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, userCreateSchema)
  return jsonOk(await createUser(ctx, input), 201)
})

import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getHomework } from '@/server/services/homework.service'
import { uuid } from '@/validation/common'

/** GET /api/v1/homework/feed/:id — one piece for a reader in its section (the same rule as /homework/:id). */
export const GET = withAuth(async ({ ctx, params }) => {
  const id = uuid.safeParse(params.id)
  if (!id.success) throw new ValidationError('That is not a valid piece of homework.')
  return jsonOk(await getHomework(ctx, id.data))
})

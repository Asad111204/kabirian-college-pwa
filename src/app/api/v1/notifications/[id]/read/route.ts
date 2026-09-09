import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { markNotificationRead } from '@/server/services/notifications.service'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid notification.')
  return parsed.data
}

/** POST /api/v1/notifications/:id/read — mark one read; returns the new count. */
export const POST = withAuth(async ({ ctx, params }) => jsonOk(await markNotificationRead(ctx, idOf(params.id))))

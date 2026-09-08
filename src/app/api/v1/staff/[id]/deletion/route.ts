import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { deleteStaff, getStaffDeletionReport } from '@/server/services/deletion.service'
import { deletionConfirmSchema } from '@/validation/finance'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid staff member.')
  return parsed.data
}

/** GET /api/v1/staff/:id/deletion — whether they can be erased, and what stands in the way. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getStaffDeletionReport(ctx, idOf(params.id))))

/** DELETE /api/v1/staff/:id/deletion — erase them, for good. */
export const DELETE = withAuth(async ({ request, ctx, params }) => {
  // The confirmation rides in the query string because a DELETE carries no
  // body through the shared API client. It is the record's own code, not a
  // secret; the check that matters is made in the service.
  const parsed = deletionConfirmSchema.safeParse({ confirm: new URL(request.url).searchParams.get('confirm') ?? '' })
  if (!parsed.success) throw new ValidationError('Type the code to confirm which record you mean to erase.')
  return jsonOk(
    await deleteStaff(ctx, idOf(params.id), parsed.data.confirm, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }),
  )
})

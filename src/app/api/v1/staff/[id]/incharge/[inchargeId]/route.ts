import { jsonOk, withAuth } from '@/server/api/handler'
import { removeIncharge } from '@/server/services/staff.service'

/** Ends the in-charge role without appointing a replacement. */
export const DELETE = withAuth(async ({ ctx, params }) =>
  jsonOk(await removeIncharge(ctx, params.id!, params.inchargeId!)),
)

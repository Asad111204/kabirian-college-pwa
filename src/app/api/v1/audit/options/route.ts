import { jsonOk, withAuth } from '@/server/api/handler'
import { getAuditFilterOptions } from '@/server/services/audit.service'

/** GET /api/v1/audit/options — the modules, actions and record types on file. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getAuditFilterOptions(ctx)))

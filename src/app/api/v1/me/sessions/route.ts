import { jsonOk, withAuth } from '@/server/api/handler'
import { listMySessions } from '@/server/services/sessions.service'

/** GET /api/v1/me/sessions — the caller's own signed-in devices. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await listMySessions(ctx)))
